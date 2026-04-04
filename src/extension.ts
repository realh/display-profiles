import Gio from 'gi://Gio';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DisplayConfigsManager } from './data.js';

// Change to false for release
const debug = true;

export default class DisplayProfilesExtension extends Extension {
    #indicator: PanelMenu.Button | null = null;
    // #popdown: DispProfsPopdown | null = null;
    #profsManager = new DisplayConfigsManager(() => {
        this.onDisplayStateChanged();
    }, debug);

    override enable() {
        const _log = debug ? console.log : () => {};
        this.#indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        const icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'video-display-symbolic' }),
            style_class: 'system-status-icon'
        });
        this.#indicator.add_child(icon);
        this.#indicator.connect('button-press-event', () => {
            this.handleIconClick();
            return true;
        });

        const menu = this.#indicator.menu as PopupMenu.PopupMenu;
        menu.connect('open-state-changed', (menu, isOpen) => {
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
    }

    override disable() {
        if (this.#indicator) {
            this.#indicator.destroy();
            this.#indicator = null;
        }
        // this.#popdown = null;
    }

    onDisplayStateChanged() {
        if (debug) {
            console.log("Display state changed: " +
                       (this.#profsManager.waiting ? "waiting" : "ready"));
        }
        // const menu = this.#indicator?.menu;
        // if (menu instanceof PopupMenu.PopupMenu && menu.isOpen) {
        //     this.#popdown?.rebuild();
        // }
    }

    handleIconClick() {
        if (!this.#indicator) {
            console.error("Null indicator button clicked");
            return;
        }
        if (debug) {
            console.log('DP@realh: DisplayProfiles icon clicked');
        }
        const menu = this.#indicator.menu as PopupMenu.PopupMenu;
        if (menu.isOpen) {
            menu.close();
        // } else {
        //     if (!this.#popdown) {
        //         this.#popdown = new DispProfsPopdown(
        //             menu,
        //             this.#profsManager);
        //     }
        //     menu.open();
        }
    }
}
