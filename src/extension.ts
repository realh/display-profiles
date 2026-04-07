import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DisplayConfigsManager } from './data.js';
import { DisplayProfilesGrid } from './grid.js';

// Change to false for release
const debug = true;

export default class DisplayProfilesExtension extends Extension {
    #indicator: PanelMenu.Button | null = null;
    #icon: St.Icon | null = null;
    #manager = new DisplayConfigsManager(() => {
        this.onDisplayStateChanged();
    }, debug);
    #profilesGrid: DisplayProfilesGrid | null = null;

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
        this.#profilesGrid = null;
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
        const menu = this.#indicator.menu as PopupMenu.PopupMenu;
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
        if (this.#profilesGrid) {
            this.#profilesGrid.rebuild();
        } else {
            const section = new PopupMenu.PopupMenuSection();
            this.#profilesGrid = new DisplayProfilesGrid(this.#manager);
            section.actor.add_child(this.#profilesGrid);
            menu.addMenuItem(section);
        }

        // if (!this.#popdown) {
        //     this.#popdown = new DisplayProfilesPopdown(menu, this.#manager);
        // }
        // this.#popdown?.rebuild();
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
            _log("DP@realh: Closing popdown/menu");
            // menu.close();
        } else {
            // if (!this.#popdown) {
            //     _log("DP@realh: Creating popdown UI");
            // }
            _log("DP@realh: Opening popdown/menu");
            // menu.open();
        }
        return Clutter.EVENT_PROPAGATE;
    }
}
