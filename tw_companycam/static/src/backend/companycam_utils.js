/** Shared helpers: upload, offline queue (IndexedDB), image URLs. */

const DB_NAME = "tw_companycam";
const STORE = "pending_captures";

/** URL of the image to show; the markup version wins over the original. */
export function photoImageUrl(photo, large = false) {
    let field = large ? "image_1920" : "image_512";
    if (photo.has_annotation) {
        field = large ? "image_annotated" : "image_annotated_512";
    }
    const unique = (photo.write_date || "").replace(/\D/g, "");
    return `/web/image/companycam.photo/${photo.id}/${field}?unique=${unique}`;
}

export function newCaptureUid() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Upload one capture. item: {uid, blob, poster, mediaType, projectId, capturedAt (ms),
 * location: {latitude, longitude, accuracy}, tagIds, duration, dual, filename}
 */
export async function uploadCapture(item) {
    const form = new FormData();
    form.append("csrf_token", odoo.csrf_token);
    form.append("project_id", item.projectId);
    form.append("media_type", item.mediaType);
    form.append("capture_uid", item.uid);
    form.append("captured_at", String(item.capturedAt));
    form.append("ufile", item.blob, item.filename);
    if (item.poster) {
        form.append("poster", item.poster, "poster.jpg");
    }
    if (item.location) {
        form.append("latitude", item.location.latitude);
        form.append("longitude", item.location.longitude);
        form.append("accuracy", item.location.accuracy || 0);
    }
    if (item.tagIds?.length) {
        form.append("tag_ids", item.tagIds.join(","));
    }
    if (item.duration) {
        form.append("duration", item.duration);
    }
    if (item.dual) {
        form.append("dual", "1");
    }
    const response = await fetch("/companycam/upload", { method: "POST", body: form });
    if (!response.ok || !(response.headers.get("Content-Type") || "").includes("json")) {
        const error = new Error(`Upload failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

/* ---------- Offline queue: captures stay on the device until uploaded ---------- */

function openDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("IndexedDB not available"));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "uid" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = callback(tx.objectStore(STORE));
        tx.oncomplete = () => {
            db.close();
            resolve(result?.result ?? result);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export async function queuePut(item) {
    try {
        await withStore("readwrite", (store) => store.put(item));
    } catch {
        // Private browsing or storage blocked: the capture stays in memory only
    }
}

export async function queueDelete(uid) {
    try {
        await withStore("readwrite", (store) => store.delete(uid));
    } catch {
        // ignore
    }
}

export async function queueAll() {
    try {
        return (await withStore("readonly", (store) => store.getAll())) || [];
    } catch {
        return [];
    }
}

export function readLocal(key, fallback = null) {
    try {
        const value = window.localStorage.getItem(`tw_companycam.${key}`);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
}

export function writeLocal(key, value) {
    try {
        window.localStorage.setItem(`tw_companycam.${key}`, JSON.stringify(value));
    } catch {
        // ignore
    }
}
