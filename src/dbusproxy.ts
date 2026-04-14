import Gio from "gi://Gio";
import GLib from "gi://GLib";

import type { DisplayConfigStateTuple, MonitorsConfigTuple } from "./tuples.js";
import { unpackVariant } from "./variant.js";

/**
 * The DBus interface is described at:
 * https://gitlab.gnome.org/GNOME/mutter/-/blob/main/data/dbus-interfaces/org.gnome.Mutter.DisplayConfig.xml
 */

/**
 * A high level DBus proxy wrapper can't be used here because it blocks on the
 * same mainloop (Mutter's) that's responsible for sending the result. This
 * class mirrors the interface that such a wrapper would have.
 */
export class DisplayConfigProxy {
    #proxy: Gio.DBusProxy;

    private constructor(proxy: Gio.DBusProxy) {
        this.#proxy = proxy;
    }

    connectMonitorsChanged(callback: () => void): number {
        return this.#proxy.connect('g-signal',
            (proxy, sender, signalName, parameters) => {
                if (signalName === 'MonitorsChanged') {
                    callback();
                }
            });
    }

    getCurrentStateAsync(): Promise<DisplayConfigStateTuple> {
        return new Promise((resolve, reject) => {
            this.#proxy.call(
                "GetCurrentState",
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (_, res) => {
                    try {
                        const result = this.#proxy.call_finish(res);
                        resolve(unpackVariant(result) as
                                DisplayConfigStateTuple);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    applyMonitorsConfigAsync(config: MonitorsConfigTuple): Promise<void> {
        return new Promise((resolve, reject) => {
            const variant = new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})',
                config);
            this.#proxy.call(
                "ApplyMonitorsConfig",
                variant,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (_, res) => {
                    try {
                        this.#proxy.call_finish(res);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    static #instance: DisplayConfigProxy | null = null;

    static async getInstance(): Promise<DisplayConfigProxy> {
        if (this.#instance) {
            return this.#instance;
        }
        return new Promise((resolve, reject) => {
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.NONE,
                null,
                "org.gnome.Mutter.DisplayConfig",
                "/org/gnome/Mutter/DisplayConfig",
                "org.gnome.Mutter.DisplayConfig",
                null,
                (_, res) => {
                    try {
                        const proxy = Gio.DBusProxy.new_for_bus_finish(res);
                        this.#instance = new DisplayConfigProxy(proxy);
                        resolve(this.#instance);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }
}
