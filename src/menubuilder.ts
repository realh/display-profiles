import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import St from "gi://St";
import { describeDisplayConfig, DisplayConfig } from "./data.js";
import {
    PopupBaseMenuItem,
    PopupSeparatorMenuItem ,
} from "resource:///org/gnome/shell/ui/popupMenu.js";

type ApplyConfigCallback = (config: DisplayConfig, closeMenu: boolean) => void;

/**
 * @param index The index of the config in the array passed to the buid method.
 * @param favourite New state of the star icon.
 * @param closeMenu Whether to close the menu after setting the favourite.
 */
type ToggleFavouriteCallback = ApplyConfigCallback;

const SPACING = 8;
// const SPC_PX = `${SPACING}px`;

export class DisplayProfilesMenuBuilder {
    #log: (...args: any) => void;
    #filledStarGIcon: Gio.ThemedIcon | null = null;
    #hollowStarGIcon: Gio.ThemedIcon | null = null;
    #onApplyConfig: (config: DisplayConfig, closeMenu: boolean) => void
    #onToggleFavourite: ToggleFavouriteCallback;

    constructor(
        onApplyConfig: ApplyConfigCallback,
        onToggleFavourite: ToggleFavouriteCallback,
        debug: boolean
    ) {
        this.#log = debug ? (...args: any) =>
                console.log("DP@realh UI:", ...args) :
            () => {};
        this.#onApplyConfig = onApplyConfig
        this.#onToggleFavourite = onToggleFavourite
    }

    build(configs: DisplayConfig[], waiting: boolean): PopupBaseMenuItem[] {
        try {
            return this.#build(configs, waiting);
        } catch (e) {
            console.error("DisplayProfiles@realh: Error building grid:", e);
            return []
        }
    }

    #build(configs: DisplayConfig[], waiting: boolean): PopupBaseMenuItem[] {
        this.#log(`${configs.length} configs to show`);
        if (configs.length == 0) {
            return [];
        }
        // this.#log("Configs:\n" + JSON.stringify(configs, null, 2));
        const items: PopupBaseMenuItem[] = [];

        // Show compatible configs before incompatible ones (sort is stable)
        configs.sort((a, b) => {
            return (a.isCompatible ? 0 : 1) - (b.isCompatible ? 0 : 1);
        });

        // Only show the transforms column if at least one != "none"
        const showTransforms = configs.some(c => {
            return c.logicalMonitors.some(m => {
                return m.transform !== "none";
            });
        });
        this.#log(`${showTransforms ? "Showing" : "Not showing"} transforms`);

        // Only show connectors if more than one is referenced
        const firstConnector =
            configs[0].logicalMonitors[0].physicalMonitors[0].connector;
        const showConnectors = configs.some(c => {
            if (c.logicalMonitors.length > 1) {
                return true;
            }
            if (c.logicalMonitors[0].physicalMonitors.length > 1) {
                return true;
            }
            if (c.logicalMonitors[0].physicalMonitors[0].connector !=
                firstConnector) {
                return true;
            }
            return false;
        });
        this.#log(`${showConnectors ? "Showing" : "Not showing"} connectors`);

        // Only show scales if any are != 100%
        const showScales = configs.some(c => {
            return c.logicalMonitors.some(m => {
                return m.scale != 1.0;
            });
        });
        this.#log(`${showScales ? "Showing" : "Not showing"} scales`);

        for (const cfg of configs) {
            this.#addConfigToMenu(cfg, items, waiting,
                showTransforms, showConnectors, showScales);
        }

        return items;
    }

    /**
     * `first` is used to help determine whether to add a separator.
     *
     * @param first: True if this is the first config
     */
    #addConfigToMenu(config: DisplayConfig, items: PopupBaseMenuItem[],
                     waiting: boolean, showTransforms: boolean,
                     showConnectors: boolean, showScales: boolean)
    {
        const numMonitors = config.logicalMonitors.reduce(
            (n, m) => m.physicalMonitors.length + n, 0);
        if (items.length > 0 && numMonitors > 1) {
            items.push(new PopupSeparatorMenuItem());
        }
        const hbox = new St.BoxLayout({
            // style_class: "dispprofs-config-row",
            reactive: !waiting,
            can_focus: config.isCompatible && !waiting,
            vertical: false,
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });

        // Column 0: Radio button
        const radioButton = this.#makeRadioButton(config, waiting);
        hbox.add_child(radioButton);

        // The middle column of the menu item row is a clickable grid of
        // monitor descriptions.
        const layout = new Clutter.GridLayout();
        layout.set_column_spacing(SPACING);
        layout.set_row_spacing(SPACING);
        const grid = new St.Widget({
            // style_class: "dispprofs-monitor-col",
            layout_manager: layout,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        if (config.isCompatible && !waiting) {
            const button = new St.Button({
                child: grid,
                reactive: true,
                can_focus: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                style_class: "popup-menu-item",
            });
            button.connect("clicked", () => this.#onApplyConfig(config, true));
            hbox.add_child(button);
        } else {
            hbox.add_child(grid);
        }
        for (const lm of config.logicalMonitors) {
            const scale = showScales ? `${Math.floor(lm.scale * 100)}%` : "";
            const transform = showTransforms ? lm.transform : "";
            for (let i = 0; i < lm.physicalMonitors.length; i++) {
                // Each row in the grid contains 1 to 4 columns
                let col = 0;
                const pm = lm.physicalMonitors[i];

                if (showConnectors) {
                    layout.attach(
                        this.#makeLabel(
                            pm.connector,
                            false,
                            config.isCompatible,
                        ),
                        col++, i, 1, 1
                    );
                }
                layout.attach(
                    this.#makeLabel(
                        i > 0 ? "mirrored" : pm.modeId,
                        true,
                        config.isCompatible,
                    ),
                    col++, i, 1, 1);
                if (i == 0 && showScales) {
                    layout.attach(
                        this.#makeLabel(
                            scale,
                            false,
                            config.isCompatible,
                        ),
                        col++, i, 1, 1
                    );
                }
                if (i == 0 && showTransforms) {
                    layout.attach(
                        this.#makeLabel(
                            transform,
                            false,
                            config.isCompatible,
                        ),
                        col++, i, 1, 1
                    );
                }
            }
        }

        // 3rd column: Star icon
        const starButton = this.#makeStarButton(config, waiting);
        hbox.add_child(starButton);

        // hbox needs to go in a PopupMenuSection so the buttons can handle
        // focus and clicks independently.
        const item = new PopupBaseMenuItem();
        // Remove the default "menu item" styling because each item contains
        // a row of 3 pseudo-items.
        item.remove_style_class_name('popup-menu-item');
        item.actor.add_child(hbox);
        items.push(item);
    }

    #makeRadioButton(config: DisplayConfig, waiting: boolean): St.Button {
        const radioIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({
                name: config.isCurrent ? "radio-checked-symbolic" :
                    "radio-symbolic"
            }),
            style_class: "popup-menu-icon",
            x_expand: false,
        });
        const radioButton = new St.Button({
            child: radioIcon,
            reactive: config.isCompatible && !waiting,
            can_focus: config.isCompatible && !waiting,
            // style_class: "dispprofs-radio-button"
            style_class: "popup-menu-item",
        });
        if (!config.isCompatible) {
            radioButton.opacity = 128;
        }
        radioButton.connect("clicked", () => {
            // Always close menu because right click doesn't work on the stars
            // which would benefit from it more, so having it work here would be
            // a bit quirky.
            this.#onApplyConfig(config, true);
        });
        return radioButton;
    }

    #makeStarButton(config: DisplayConfig, waiting: boolean):
        St.Button
    {
        const stIcon = new St.Icon({
            gicon: this.#getStarGIconForConfig(config),
            style_class: "popup-menu-icon"
        });
        const button = new St.Button({
            child: stIcon,
            reactive: !waiting,
            can_focus: !waiting,
            // style_class: "dispprofs-star-button",
            x_expand: false,
            style_class: "popup-menu-item",
        });
        button.connect("clicked", () => {
            this.#onStarButtonClicked(config, stIcon, true);
        });
        // button-release-event doesn't actually get called
        // button.connect("button-release-event", (_actor, event) => {
        //     this.#log(
        //         `Star button (${event.get_button()}) released for ` +
        //         `${describeDisplayConfig(config)}`);
        //     if (event.get_button() == 2) {
        //         this.#onStarButtonClicked(config, stIcon, false);
        //         return true;
        //     }
        //     return false;
        // });
        return button;
    }

    #onStarButtonClicked(config: DisplayConfig, icon: St.Icon,
                         closeMenu: boolean)
    {
        this.#log(
            `Star button clicked for ${config.id} ` +
            `${describeDisplayConfig(config)}; ` +
            `favourite was ${config.isFavourite}`);
        config.isFavourite = !config.isFavourite;
        icon.set_gicon(this.#getStarGIconForConfig(config));
        this.#onToggleFavourite(config, closeMenu);
    }

    #getStarGIconForConfig(config: DisplayConfig) {
        if (config.isFavourite) {
            if (!this.#filledStarGIcon) {
                this.#filledStarGIcon = new Gio.ThemedIcon({
                    name: "starred-symbolic"
                });
            }
            return this.#filledStarGIcon;
        }
        else {
            if (!this.#hollowStarGIcon) {
                this.#hollowStarGIcon = new Gio.ThemedIcon({
                    name: "non-starred-symbolic"
                });
            }
            return this.#hollowStarGIcon;
        }
    }

    #makeLabel(text: string, expand: boolean, isCompatible: boolean = true):
        St.Label
    {
        const label = new St.Label({
            text,
            // style_class: "dispprofs-monitor-label",
            x_expand: expand,
            x_align: Clutter.ActorAlign.START,
        });
        if (!isCompatible) {
            label.style = "color: #ff9060;";
        }        return label;
    }
};
