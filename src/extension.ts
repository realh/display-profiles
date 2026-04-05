import Gio from 'gi://Gio';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DisplayConfigsManager } from './data.js';
import { DisplayProfilesPopdown } from './uipopdown.js';

// Change to false for release
const debug = true;

export default class DisplayProfilesExtension extends Extension {
    #indicator: PanelMenu.Button | null = null;
    #icon: St.Icon | null = null;
    #popdown: DisplayProfilesPopdown | null = null;
    #manager = new DisplayConfigsManager(() => {
        this.onDisplayStateChanged();
    }, debug);

    override enable() {
        const _log = debug ? console.log : () => {};
        _log("DP@realh: DisplayProfiles extension enabled");
        this.#manager.init();
        this.#indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this.#icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'video-display-symbolic' }),
            style_class: 'system-status-icon'
        });
        this.#indicator.add_child(this.#icon);
        this.#indicator.connect('button-press-event', () => {
            this.handleIconClick();
            return true;
        });

        const menu = this.#indicator.menu as PopupMenu.PopupMenu;
        menu.connect('open-state-changed', (_, isOpen) => {
            if (this.#indicator) {
                if (isOpen) {
                    this.#indicator.add_style_pseudo_class('checked');
                } else {
                    this.#indicator.remove_style_pseudo_class('checked');
                }
            }
            // if (!isOpen) {
            //     this.#profsManager.commitChanges().catch(e => {
            //         console.error("Failed to commit favorite changes", e);
            //     });
            // }
            return false;
        });

        Main.panel.addToStatusArea(this.uuid, this.#indicator);

        this.onDisplayStateChanged();
    }

    override disable() {
        if (this.#indicator) {
            this.#indicator.destroy();
            this.#indicator = null;
        }
        // this.#popdown = null;
    }

    onDisplayStateChanged() {
        const _log = debug ? console.log : () => {};
        _log("DP@realh: Display state changed: " +
                   (this.#manager.waiting ? "waiting" : "ready"));
        if (!this.#indicator) {
            console.error(
                "DisplayProfiles@realh: Panel button is null at state change");
            return;
        }
        const waiting = this.#manager.waiting;
        const menu = this.#indicator.menu;
        const uiIsOpen = menu instanceof PopupMenu.PopupMenu && menu.isOpen;
        if (waiting && !uiIsOpen) {
            _log("DP@realh: Disabling panel button");
            this.#indicator.reactive = false;
            this.#indicator.can_focus = false;
            this.#icon ? this.#icon.opacity = 100 : undefined;
            return;
        } else {
            _log("DP@realh: Enabling panel button");
            this.#indicator.reactive = true;
            this.#indicator.can_focus = true;
            this.#icon ? this.#icon.opacity = 255 : undefined;
        }
        _log("DP@realh: Rebuilding popdown");
        this.#popdown?.rebuild();
    }

    handleIconClick() {
        if (!this.#indicator) {
            console.error("DP@realh: Null indicator button clicked");
            return;
        }
        const _log = debug ? console.log : () => {};
        _log("DP@realh: DisplayProfiles icon clicked");
        const menu = this.#indicator.menu as PopupMenu.PopupMenu;
        if (menu.isOpen) {
            _log("DP@realh: Closing popdown");
            menu.close();
        } else {
            if (!this.#popdown) {
                _log("DP@realh: Creating popdown UI");
                this.#popdown = new DisplayProfilesPopdown(menu, this.#manager);
            }
            _log("DP@realh: Opening menu");
            menu.open();
        }
    }
}
