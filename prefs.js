import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio'; // Explicitly import Gio for SettingsBindFlags
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardIndicatorPreferences extends ExtensionPreferences {
    getPreferencesWidget() {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: _('General Settings'),
        });
        page.add(group);

        // Max History Size Setting
        const historySizeRow = new Adw.ActionRow({
            title: _('Max History Size'),
            subtitle: _('Number of items to keep in history (5-50)'),
        });
        group.add(historySizeRow);

        const historySizeSpinButton = Gtk.SpinButton.new_with_range(5, 50, 1);
        // Bind GSettings key to the SpinButton's value property
        this.settings.bind(
            'max-history-size', // GSettings key
            historySizeSpinButton, // Gtk.Widget
            'value', // Property on Gtk.Widget
            Gio.SettingsBindFlags.DEFAULT // Gio.SettingsBindFlags
        );

        historySizeRow.add_suffix(historySizeSpinButton);
        historySizeRow.activatable_widget = historySizeSpinButton;

        // Show Copy Notifications Setting
        const notificationRow = new Adw.SwitchRow({
            title: _('Show Copy Notifications'),
            subtitle: _('Display a notification when an item is copied'),
        });
        group.add(notificationRow);
        // Bind GSettings key to the Switch's active property
        this.settings.bind(
            'show-copy-notifications', // GSettings key
            notificationRow,           // Adw.SwitchRow (or its switch widget if directly accessible)
            'active',                  // Property on Adw.SwitchRow
            Gio.SettingsBindFlags.DEFAULT // Gio.SettingsBindFlags
        );

        return page;
    }

    constructor(metadata) {
        super(metadata);
        // this.settings is automatically populated by the ExtensionPreferences base class
        // when 'settings-schema' is defined in metadata.json.
    }
}
