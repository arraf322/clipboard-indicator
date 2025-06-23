import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib'; // For GLib.basename as a fallback

// const MAX_HISTORY_SIZE = 10; // Default history size - REMOVED
const MAX_DISPLAY_TEXT_LENGTH = 50; // Max length for display in menu

export default class ClipboardIndicatorExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._clearHistoryMenuItem = null;

        this._history = [];
        this._clipboard = St.Clipboard.get_default();
        this._clipboardOwnerChangeSignalId = 0;

        this._settings = this.getSettings(); // Initialize settings
        this._maxHistorySizeChangedId = 0; // For settings signal
        // this._showNotificationsChangedId = 0; // For settings signal (optional for this task)
    }

    enable() {
        console.log(`Enabling ${this.metadata.name}`);
        this._indicator = new PanelMenu.Button(0.0, 'ClipboardIndicatorButton', false);

        const icon = new St.Icon({
            icon_name: 'edit-paste-symbolic',
            style_class: 'system-status-icon',
            icon_size: 16
        });
        this._indicator.add_child(icon);
        this._indicator.menu = new PopupMenu.PopupMenu(this._indicator, 0.5, St.Side.BOTTOM);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._loadInitialClipboardContent();

        this._clipboardOwnerChangeSignalId = this._clipboard.connect('owner-changed', () => {
            this._onClipboardUpdate();
        });

        this._maxHistorySizeChangedId = this._settings.connect('changed::max-history-size', () => {
            console.log(`${this.metadata.name}: max-history-size setting changed to ${this._settings.get_int('max-history-size')}`);
            this._applyMaxHistorySize();
        });

        // Optional: connect to show-copy-notifications change if implementing its logic
        // this._showNotificationsChangedId = this._settings.connect('changed::show-copy-notifications', () => {
        // console.log(`${this.metadata.name}: show-copy-notifications setting changed to ${this._settings.get_boolean('show-copy-notifications')}`);
        // });

        console.log(`${this.metadata.name}: Indicator, menu, clipboard and settings listeners enabled.`);
    }

    disable() {
        console.log(`Disabling ${this.metadata.name}`);
        if (this._clipboard && this._clipboardOwnerChangeSignalId) {
            this._clipboard.disconnect(this._clipboardOwnerChangeSignalId);
            this._clipboardOwnerChangeSignalId = 0;
        }

        if (this._settings && this._maxHistorySizeChangedId) {
            this._settings.disconnect(this._maxHistorySizeChangedId);
            this._maxHistorySizeChangedId = 0;
        }
        // if (this._settings && this._showNotificationsChangedId) { // If connected
        // this._settings.disconnect(this._showNotificationsChangedId);
        // this._showNotificationsChangedId = 0;
        // }
        this._settings = null; // Release settings object

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._history = []; // Clear history on disable
        this._clearHistoryMenuItem = null; // Clear reference
        console.log(`${this.metadata.name}: Disabled and cleaned up.`);
    }

    _applyMaxHistorySize() {
        const currentMax = this._settings.get_int('max-history-size');
        if (this._history.length > currentMax) {
            this._history.splice(currentMax); // Remove items from the end to meet new size
            this._rebuildMenu();
            console.log(`${this.metadata.name}: History trimmed to new max size: ${currentMax}`);
        }
    }

    _loadInitialClipboardContent() {
        const maxHistory = this._settings.get_int('max-history-size');
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (text) {
                this._history.unshift(text);
                if (this._history.length > maxHistory) {
                    this._history.pop();
                }
            }
            this._rebuildMenu(); // Rebuild menu even if text is null to show "empty" state
        });
    }

    _onClipboardUpdate() {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (text) {
                this._addContentToHistory(text);
            }
            // If text is null (e.g. image copied), history won't change for text items.
            // _rebuildMenu is called by _addContentToHistory if text is valid.
        });
    }

    _addContentToHistory(text) {
        if (!text || text.trim() === '') {
            console.log(`${this.metadata.name}: Ignoring empty or whitespace-only clipboard content.`);
            return;
        }
        if (this._history.length > 0 && this._history[0] === text) {
            console.log(`${this.metadata.name}: Ignoring duplicate of the most recent history item.`);
            return;
        }

        const maxHistory = this._settings.get_int('max-history-size');
        this._history.unshift(text);
        if (this._history.length > maxHistory) {
            this._history.pop();
        }
        // Optionally show notification
        // if (this._settings.get_boolean('show-copy-notifications')) {
        //     Main.notify(`${this.metadata.name}`, `Copied: ${this._truncateText(text, 20)}`);
        // }
        this._rebuildMenu();
        console.log(`${this.metadata.name}: Added to history: ${this._truncateText(text)}`);
    }

    _rebuildMenu() {
        if (!this._indicator || !this._indicator.menu) {
            console.error(`${this.metadata.name}: Cannot rebuild menu, indicator or menu not found.`);
            return;
        }
        this._indicator.menu.removeAll();

        if (this._history.length === 0) {
            let emptyHistoryLabel = new PopupMenu.PopupMenuItem("Clipboard is empty", { reactive: false });
            this._indicator.menu.addMenuItem(emptyHistoryLabel);
        } else {
            for (const itemText of this._history) {
                let menuItem;
                let isFile = itemText.startsWith('file:///') || itemText.startsWith('/');
                let displayName = itemText;
                let iconName = null;

                if (isFile) {
                    try {
                        let gfile;
                        if (itemText.startsWith('file:///')) {
                            gfile = Gio.File.new_for_uri(itemText);
                        } else {
                            gfile = Gio.File.new_for_path(itemText);
                        }

                        if (gfile) {
                            // Prefer basename for display, fallback to GLib.basename if gfile.get_basename() is null/empty
                            let basename = gfile.get_basename();
                            if (basename && basename.trim() !== '') {
                                displayName = basename;
                            } else {
                                // Fallback for paths like "/" or "file:///" where basename might be empty or null
                                displayName = GLib.basename(itemText);
                                if (!displayName || displayName === '.' || displayName === '/') {
                                     // If GLib.basename gives unhelpful result, use the original truncated path
                                     displayName = this._truncateText(itemText, MAX_DISPLAY_TEXT_LENGTH);
                                }
                            }
                            iconName = 'document-open-symbolic'; // A common file icon
                        }
                    } catch (e) {
                        console.warn(`${this.metadata.name}: Could not parse file path/URI: ${itemText}. Error: ${e.message}`);
                        // Treat as normal text if parsing fails
                        displayName = itemText; // Revert to full itemText for truncation
                        iconName = null; // Ensure no icon if it failed
                    }
                }

                if (iconName) { // If it's a file and we successfully got an icon name
                    // For PopupImageMenuItem, the label is the first arg.
                    // The displayed text will be the (potentially truncated) displayName.
                    menuItem = new PopupMenu.PopupImageMenuItem(
                        this._truncateText(displayName, MAX_DISPLAY_TEXT_LENGTH),
                        iconName,
                        {}); // Empty params
                } else {
                    // Normal text item or file parsing failed
                    menuItem = new PopupMenu.PopupMenuItem(
                        this._truncateText(itemText, MAX_DISPLAY_TEXT_LENGTH)
                    );
                }

                // Crucially, connect activate to copy the *original* itemText
                menuItem.connect('activate', () => {
                    this._clipboard.set_text(St.ClipboardType.CLIPBOARD, itemText);
                    console.log(`${this.metadata.name}: Copied to clipboard: ${this._truncateText(itemText)}`);
                });
                this._indicator.menu.addMenuItem(menuItem);
            }
        }

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Re-add the "Clear History" button
        this._clearHistoryMenuItem = new PopupMenu.PopupMenuItem("Clear History");
        this._clearHistoryMenuItem.connect('activate', () => {
            this._clearHistory();
        });
        this._indicator.menu.addMenuItem(this._clearHistoryMenuItem);
        // console.log(`${this.metadata.name}: Menu rebuilt with ${this._history.length} items.`);
    }

    _truncateText(text, maxLength = MAX_DISPLAY_TEXT_LENGTH) {
        if (typeof text !== 'string') return ''; // Should not happen with get_text
        if (text.length > maxLength) {
            return text.substring(0, maxLength - 3) + "...";
        }
        return text;
    }

    _clearHistory() {
        this._history = [];
        this._rebuildMenu();
        console.log(`${this.metadata.name}: History cleared.`);
    }
}
