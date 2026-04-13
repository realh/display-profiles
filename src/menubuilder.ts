import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import St from "gi://St";
import { DisplayConfig } from "./data.js";
import {
    PopupBaseMenuItem,
    PopupMenuSection,
    PopupSeparatorMenuItem ,
} from "resource:///org/gnome/shell/ui/popupMenu.js";

type PopupMenuChild = PopupBaseMenuItem | PopupMenuSection;

const SPACING = 8;
const SPC_PX = `${SPACING}px`;

export class DisplayProfilesMenuBuilder {
    #log: (...args: any) => void;
    #filledStarGIcon: Gio.ThemedIcon | null = null;
    #hollowStarGIcon: Gio.ThemedIcon | null = null;

    constructor(debug: boolean) {
        this.#log = debug ? (...args: any) =>
                console.log("DP@realh grid:", ...args) :
            () => {};

    }

    build(configs: DisplayConfig[], waiting: boolean): PopupMenuChild[] {
        try {
            return this.#build(configs, waiting);
        } catch (e) {
            console.error("DisplayProfiles@realh: Error building grid:", e);
            return []
        }
    }

    #build(configs: DisplayConfig[], waiting: boolean): PopupMenuChild[] {
        this.#log(`${configs.length} configs to show`);
        if (configs.length == 0) {
            return [];
        }
        // this.#log("Configs:\n" + JSON.stringify(configs, null, 2));
        const items: PopupMenuChild[] = [];

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
        this.#log(`${showTransforms ? "Not showing" : "showing"} transforms`);

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
        this.#log(`${showConnectors ? "Not showing" : "showing"} connectors`);

        // Only show scales if any are != 100%
        const showScales = configs.some(c => {
            return c.logicalMonitors.some(m => {
                return m.scale != 1.0;
            });
        });
        this.#log(`${showScales ? "Not showing" : "showing"} scales`);

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
    #addConfigToMenu(config: DisplayConfig, items: PopupMenuChild[],
                     waiting: boolean, showTransforms: boolean,
                     showConnectors: boolean, showScales: boolean)
    {
        let hboxStyle = `spacing: ${SPC_PX}; margin-bottom: ${SPC_PX};`;
        const numMonitors = config.logicalMonitors.reduce(
            (n, m) => m.physicalMonitors.length + n, 0);
        if (items.length > 0 && numMonitors > 1) {
            items.push(new PopupSeparatorMenuItem());
        } else {
            hboxStyle += ` margin-top: ${SPC_PX};`;
        }
        const hbox = new St.BoxLayout({
            // style_class: "dispprofs-config-row",
            style: hboxStyle,
            reactive: !waiting,
            can_focus: config.isCompatible && !waiting,
            vertical: false,
            orientation: Clutter.Orientation.HORIZONTAL,
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
            reactive: !waiting,
            can_focus: config.isCompatible && !waiting,
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
            });
            //button.connect("clicked", () => this._onApplyConfig(config, true));
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
                            pm.preferredMode == pm.modeId
                        ),
                        col++, i, 1, 1
                    );
                }
                layout.attach(
                    this.#makeLabel(
                        i > 0 ? "mirrored" : pm.modeId,
                        true,
                        config.isCompatible,
                        pm.preferredMode == pm.modeId
                    ),
                    col++, i, 1, 1);
                if (i == 0 && showScales) {
                    layout.attach(
                        this.#makeLabel(
                            scale,
                            false,
                            config.isCompatible,
                            pm.preferredScale == lm.scale
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
                            false
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
        const itemSection = new PopupMenuSection();
        itemSection.actor.add_child(hbox);
        items.push(itemSection);
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
        });
        if (!config.isCompatible) {
            radioButton.opacity = 128;
        }
        // radioButton.connect("clicked", () => {
        //     this._onApplyConfig(config, false);
        // });
        return radioButton;
    }

    #makeStarButton(config: DisplayConfig, waiting: boolean): St.Button {
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
        });
        button.connect('clicked', () => {
            config.isFavourite = !config.isFavourite;
            stIcon.set_gicon(this.#getStarGIconForConfig(config));
        });
        return button;
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

    #makeLabel(text: string, expand: boolean,
               isCompatible: boolean = true, isPreferred: boolean): St.Label
    {
        const label = new St.Label({
            text,
            // style_class: "dispprofs-monitor-label",
            x_expand: expand,
            x_align: Clutter.ActorAlign.START,
        });
        if (!isCompatible) {
            label.style = "color: #ff9060;";
        } else if (isPreferred) {
            label.style = "color: #60ff90;";
        }
        return label;
    }
};
