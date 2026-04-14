import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DisplayConfigsManager } from './data.js';
import { DisplayProfilesMenuBuilder } from './menubuilder.js';
import type {
    ExtensionMetadata
} from 'gi://gnome-shell/dist/types/extension-metadata.js';

// Change to false for release
const debug = true;

export default class DisplayProfilesExtension extends Extension {
    #indicator: PanelMenu.Button | null = null;
    #icon: St.Icon | null = null;
    #manager = new DisplayConfigsManager(() => {
        this.onDisplayStateChanged();
    }, debug);
    get #menu(): PopupMenu.PopupMenu | undefined {
        return this.#indicator?.menu as PopupMenu.PopupMenu;
    }
    #menuBuilder = new DisplayProfilesMenuBuilder(
        (config, closeMenu) => {
            this.#manager?.applyConfig(config);
            if (closeMenu && this.#menu?.isOpen) {
                this.#menu?.close();
            }
        },
        (config, closeMenu) => {
            this.#manager?.updateFavourite(config);
            if (closeMenu && this.#menu?.isOpen) {
                this.#menu?.close();
            }
        },
        debug);
    #log: (...args: any) => void

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this.#log = debug ? (...args: any) =>
                console.log("DP@realh:", ...args) :
            () => {};
    }

    override enable() {
        this.#log("DisplayProfiles extension enabled");
        this.#manager.init();
        this.#indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this.#icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'video-display-symbolic' }),
            style_class: 'system-status-icon'
        });
        this.#indicator.add_child(this.#icon);
        this.#indicator.connect('button-press-event', () => {
            return this.handleIconClick();
        });

        // menu.connect('open-state-changed', (_, isOpen) => {
        //     // if (this.#indicator) {
        //     //     if (isOpen) {
        //     //         this.#indicator.add_style_pseudo_class('checked');
        //     //     } else {
        //     //         this.#indicator.remove_style_pseudo_class('checked');
        //     //     }
        //     // }
        //     // if (!isOpen) {
        //     //     this.#profsManager.commitChanges().catch(e => {
        //     //         console.error("Failed to commit favorite changes", e);
        //     //     });
        //     // }
        //     return false;
        // });

        Main.panel.addToStatusArea(this.uuid, this.#indicator);

        this.onDisplayStateChanged();
    }

    override disable() {
        if (this.#indicator) {
            this.#indicator.destroy();
            this.#indicator = null;
        }
    }

    onDisplayStateChanged() {
        this.#log("Display state changed: " +
                   (this.#manager.waiting ? "waiting" : "ready"));
        if (!this.#indicator) {
            console.error(
                "DisplayProfiles@realh: Panel button is null at state change");
            return;
        }
        const waiting = this.#manager.waiting;
        const menu = this.#menu;
        const uiIsOpen = menu?.isOpen;

        let disable = waiting && !uiIsOpen;
        let configs = this.#manager.getConfigs();
        if (!waiting) {
            // If there are no display modes at all (no favourites and we're
            // running in a window) keep the button disabled.
            if (configs.length == 0) {
                this.#log("No configs");
                disable = true;
                if (uiIsOpen) {
                    menu.close();
                }
            }
        }

        if (disable) {
            this.#log("Disabling panel button");
            this.#indicator.reactive = false;
            this.#indicator.can_focus = false;
            this.#icon ? this.#icon.opacity = 100 : undefined;
            return;
        } else {
            this.#log("Enabling panel button");
            this.#indicator.reactive = true;
            this.#indicator.can_focus = true;
            this.#icon ? this.#icon.opacity = 255 : undefined;
        }

        this.#log("Rebuilding menu body table");
        menu?.removeAll();
        const menuItems = this.#menuBuilder.build(configs, waiting);
        for (const item of menuItems) {
            menu?.addMenuItem(item);
        }
    }

    handleIconClick() {
        if (!this.#indicator) {
            console.error("DP@realh: Null indicator button clicked");
            return;
        }
        this.#log("DisplayProfiles icon clicked");
        const menu = this.#indicator.menu as PopupMenu.PopupMenu;
        if (menu.isOpen) {
            this.#log("Closing popdown/menu");
            // menu.close();
        } else {
            // if (!this.#popdown) {
            //     this.#log("Creating popdown UI");
            // }
            this.#log("Opening popdown/menu");
            // menu.open();
        }
        return Clutter.EVENT_PROPAGATE;
    }
}
