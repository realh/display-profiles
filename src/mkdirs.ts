import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";

export function isDirectory(file: Gio.File): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        file.query_info_async(
            Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
            Gio.FileQueryInfoFlags.NONE,    // Follows symlinks by default
            GLib.PRIORITY_DEFAULT,
            null,
            (obj, res) => {
                if (!obj) {
                    reject(new Error("Null object in result of " +
                        "query_info_async for " + file.get_path()));
                    return;
                }
                try {
                    const fileInfo = obj.query_info_finish(res);
                    if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
                        resolve(true);
                        return;
                    }
                    reject(new Error(file.get_path() + " is not a directory"));
                } catch (e) {
                    if (e instanceof GLib.Error &&
                        e.domain === Gio.io_error_quark() &&
                        e.code === Gio.IOErrorEnum.NOT_FOUND)
                    {
                        resolve(false);
                        return;
                    }
                    console.error("Error in query_info_finish for " +
                        file.get_path(), e);
                    reject(e);
                }
            }
        );
    });
}

export async function mkdirWithParentsAsync(file: Gio.File): Promise<boolean> {
    // This doesn't need to trap errors, just let them propagate.
    if (await isDirectory(file)) {
        // `dir` exists as a directory, good.
        return true;
    }
    // At this point `dir` does not exist yet, and we don't know whether its
    // parent does, so recurse.
    const parent = file.get_parent();
    if (!parent) {
        throw new Error("Filesystem does not exist");
    }
    if (!await mkdirWithParentsAsync(parent)) {
        throw new Error("Failed to create " + parent.get_path() +
                        "; reason unknown");
    }
    // At this point `parent` does exist, try to create `dir`.
    return new Promise((resolve, reject) => {
        file.make_directory_async(GLib.PRIORITY_DEFAULT, null,
            (obj, res) => {
                if (!obj) {
                    throw new Error("Null object in result of " +
                        "make_directory_async for " + file.get_path());
                }
                if (obj.make_directory_finish(res)) {
                    resolve(true);
                } else {
                    reject(new Error("Failed to create " + file.get_path() +
                        "; reason unknown"));
                }
            }
        );
    });
}
