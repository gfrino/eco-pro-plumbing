import { Component, onMounted, onWillStart, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { ProjectPickerDialog } from "../project_picker/project_picker";
import {
    newCaptureUid,
    queueAll,
    queueDelete,
    queuePut,
    readLocal,
    uploadCapture,
    writeLocal,
} from "../companycam_utils";

const MAX_VIDEO_SECONDS = 240; // keeps uploads well under the server request limit
const VIDEO_MIME_TYPES = [
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
];

function canvasToBlob(canvas, quality = 0.9) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Full-screen job-site camera: photo, video and dual (front + back) video.
 * Every capture gets project, time, GPS and tags, and is uploaded in the background;
 * without connection it is kept on the device and sent later.
 */
export class CompanyCamCamera extends Component {
    static template = "tw_companycam.CameraAction";
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.videoRef = useRef("video");
        this.previewCanvasRef = useRef("previewCanvas");
        this.pipRef = useRef("pip");
        this.fileRef = useRef("fileInput");

        this.state = useState({
            project: null,
            mode: "photo", // photo | video | dual
            facing: "environment",
            ready: false,
            error: "",
            needsTap: false, // iOS refused to start the preview by itself
            recording: false,
            recSeconds: 0,
            flash: false,
            captures: [], // {uid, previewUrl, mediaType, status: pending|uploading|done|error}
            tags: [],
            selectedTagIds: [],
            showTags: false,
            location: null,
            locationError: false,
            now: new Date(),
            online: navigator.onLine,
        });
        this.queue = [];
        this.objectUrls = [];

        onWillStart(async () => {
            const params = this.props.action.params || {};
            const context = this.props.action.context || {};
            const projectId = params.project_id || context.default_project_id || readLocal("lastProjectId");
            const [projects, tags] = await Promise.all([
                projectId
                    ? this.orm.searchRead("project.project", [["id", "=", projectId]], ["name"])
                    : Promise.resolve([]),
                this.orm.searchRead("companycam.tag", [], ["name", "color"]),
            ]);
            if (projects.length) {
                this.state.project = { id: projects[0].id, name: projects[0].name };
            }
            this.state.tags = tags;
        });

        onMounted(async () => {
            this.onOnline = () => {
                this.state.online = true;
                this.processQueue();
            };
            this.onOffline = () => (this.state.online = false);
            window.addEventListener("online", this.onOnline);
            window.addEventListener("offline", this.onOffline);
            // iOS pauses the preview when the app goes to background or after a capture
            this.onVisibility = () => document.visibilityState === "visible" && this.checkPreview();
            this.onVideoPaused = () => setTimeout(() => this.checkPreview(), 300);
            document.addEventListener("visibilitychange", this.onVisibility);
            this.videoRef.el.addEventListener("pause", this.onVideoPaused);
            this.videoRef.el.addEventListener("stalled", this.onVideoPaused);
            this.clock = setInterval(() => (this.state.now = new Date()), 1000);
            this.watchLocation();
            await this.restorePendingCaptures();
            await this.startCamera();
        });

        onWillUnmount(() => {
            this.unmounted = true;
            this.stopRecording(true);
            cancelAnimationFrame(this.previewLoop);
            this.stopCamera();
            clearInterval(this.clock);
            clearInterval(this.recTimer);
            window.removeEventListener("online", this.onOnline);
            window.removeEventListener("offline", this.onOffline);
            document.removeEventListener("visibilitychange", this.onVisibility);
            if (this.geoWatch !== undefined) {
                navigator.geolocation.clearWatch(this.geoWatch);
            }
            const waiting = this.state.captures.filter((c) => c.status !== "done").length;
            if (waiting) {
                this.notification.add(
                    _t("%s captures are saved on this device and will be uploaded next time you open the camera.", waiting),
                    { type: "warning" }
                );
            }
            this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
        });
    }

    // ------------------------------------------------------------------
    // Getters for the template
    // ------------------------------------------------------------------
    get stampDate() {
        return this.state.now.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    }

    get stampTime() {
        return this.state.now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    get stampLocation() {
        const loc = this.state.location;
        if (!loc) {
            return this.state.locationError ? _t("Location off") : _t("Finding location…");
        }
        return `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)} ±${Math.round(loc.accuracy)} m`;
    }

    get recordingLabel() {
        const s = this.state.recSeconds;
        return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }

    get projectLabel() {
        return this.state.project ? this.state.project.name : _t("No project");
    }

    get shutterLabel() {
        if (this.state.mode === "photo") {
            return _t("Take photo");
        }
        return this.state.recording ? _t("Stop recording") : _t("Start recording");
    }

    get pendingCount() {
        return this.state.captures.filter((c) => c.status !== "done").length;
    }

    get lastCapture() {
        return this.state.captures[0];
    }

    get modes() {
        return [
            { key: "photo", label: _t("Photo") },
            { key: "video", label: _t("Video") },
            { key: "dual", label: _t("Dual") },
        ];
    }

    isTagSelected(tag) {
        return this.state.selectedTagIds.includes(tag.id);
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------
    async startCamera() {
        this.stopCamera();
        this.state.ready = false;
        if (!navigator.mediaDevices?.getUserMedia) {
            this.state.error = _t(
                "This browser cannot open the camera here. Use “Upload” to add photos and videos from your device."
            );
            return;
        }
        const wantAudio = this.state.mode !== "photo";
        const facing = this.state.mode === "dual" ? "environment" : this.state.facing;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: wantAudio,
            });
        } catch (error) {
            this.state.error =
                error.name === "NotAllowedError"
                    ? _t("Camera access is blocked. Allow the camera for this site in your browser settings, or use “Upload”.")
                    : _t("No camera was found on this device. Use “Upload” to add photos and videos.");
            return;
        }
        if (this.unmounted) {
            this.stopCamera();
            return;
        }
        const video = this.videoRef.el;
        this.prepareVideo(video);
        video.srcObject = this.stream;
        await this.waitForMetadata(video);
        await this.playPreview();
        this.startPreviewLoop();

        if (this.state.mode === "dual") {
            await this.startPip();
        }
        this.state.error = "";
        this.state.ready = true;
    }

    async startPip() {
        try {
            this.pipStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
        } catch {
            this.pipStream = null;
        }
        // Many phones can open only one camera at a time: opening the second stops the first
        const mainTrack = this.stream?.getVideoTracks()[0];
        if (!this.pipStream || !mainTrack || mainTrack.readyState === "ended") {
            this.pipStream?.getTracks().forEach((t) => t.stop());
            this.pipStream = null;
            this.notification.add(
                _t("This device cannot use both cameras at the same time. Videos are recorded with the back camera."),
                { type: "info" }
            );
            if (!mainTrack || mainTrack.readyState === "ended") {
                this.state.mode = "video";
                await this.startCamera();
            }
            return;
        }
        const pip = this.pipRef.el;
        this.prepareVideo(pip);
        pip.srcObject = this.pipStream;
        await pip.play().catch(() => {});
    }

    stopCamera() {
        for (const stream of [this.stream, this.pipStream]) {
            stream?.getTracks().forEach((track) => track.stop());
        }
        this.stream = null;
        this.pipStream = null;
        for (const ref of [this.videoRef, this.pipRef]) {
            if (ref.el) {
                ref.el.srcObject = null;
            }
        }
    }

    /**
     * iOS Safari shows a black preview unless the video is muted and inline as *properties*
     * (template attributes are not enough on cloned elements), set before the stream.
     */
    prepareVideo(video) {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.setAttribute("muted", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
    }

    waitForMetadata(video) {
        if (video.readyState >= 1) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const done = () => {
                video.removeEventListener("loadedmetadata", done);
                resolve();
            };
            video.addEventListener("loadedmetadata", done);
            setTimeout(done, 3000);
        });
    }

    async playPreview() {
        const video = this.videoRef.el;
        if (!video || !this.stream) {
            return;
        }
        try {
            await video.play();
            this.state.needsTap = false;
        } catch {
            // Autoplay refused: a tap (user gesture) is needed to start it
            this.state.needsTap = true;
        }
    }

    /**
     * Paint the live preview on a canvas. iOS Safari sometimes plays the camera video without
     * painting it (black screen) although its frames are readable: drawing the frames
     * ourselves (same method used to take the photo) always shows them.
     */
    startPreviewLoop() {
        cancelAnimationFrame(this.previewLoop);
        const canvas = this.previewCanvasRef.el;
        const video = this.videoRef.el;
        if (!canvas || !video) {
            return;
        }
        const ctx = canvas.getContext("2d");
        const draw = () => {
            if (this.unmounted || !this.stream) {
                return;
            }
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.round(canvas.clientWidth * dpr);
            const height = Math.round(canvas.clientHeight * dpr);
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (vw && vh && width && height && video.readyState >= 2) {
                // same framing as object-fit: cover
                const scale = Math.max(width / vw, height / vh);
                const dw = vw * scale;
                const dh = vh * scale;
                ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
            }
            this.previewLoop = requestAnimationFrame(draw);
        };
        draw();
    }

    /** Restart the preview if iOS paused it, or reopen the camera if the track died. */
    async checkPreview() {
        if (this.unmounted || !this.stream || this.state.recording) {
            return;
        }
        const track = this.stream.getVideoTracks()[0];
        if (!track || track.readyState === "ended") {
            await this.startCamera();
            return;
        }
        if (this.videoRef.el?.paused) {
            await this.playPreview();
        }
    }

    async setMode(mode) {
        if (this.state.recording || this.state.mode === mode) {
            return;
        }
        this.state.mode = mode;
        await this.startCamera();
    }

    async flipCamera() {
        if (this.state.recording || this.state.mode === "dual") {
            return;
        }
        this.state.facing = this.state.facing === "environment" ? "user" : "environment";
        await this.startCamera();
    }

    watchLocation() {
        if (!navigator.geolocation) {
            this.state.locationError = true;
            return;
        }
        this.geoWatch = navigator.geolocation.watchPosition(
            (pos) => {
                this.state.location = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                };
                this.state.locationError = false;
            },
            () => (this.state.locationError = true),
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
        );
    }

    // ------------------------------------------------------------------
    // Capture
    // ------------------------------------------------------------------
    onShutter() {
        if (this.state.mode === "photo") {
            this.takePhoto();
        } else if (this.state.recording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    grabFrame(maxSide = 0) {
        const video = this.videoRef.el;
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (!width || !height) {
            return null;
        }
        if (maxSide && Math.max(width, height) > maxSide) {
            const ratio = maxSide / Math.max(width, height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(video, 0, 0, width, height);
        return canvas;
    }

    async takePhoto() {
        const canvas = this.grabFrame();
        if (!canvas) {
            return;
        }
        this.state.flash = true;
        setTimeout(() => (this.state.flash = false), 150);
        // Free the full-size canvas right away: iOS has little canvas memory and may
        // otherwise blank the live preview
        const blob = await canvasToBlob(canvas, 0.9);
        canvas.width = 0;
        canvas.height = 0;
        this.addCapture({ blob, mediaType: "photo", filename: `photo-${Date.now()}.jpg` });
        this.checkPreview();
    }

    startRecording() {
        if (!this.stream || typeof MediaRecorder === "undefined") {
            this.notification.add(_t("Video recording is not supported by this browser. Use “Upload” instead."), {
                type: "warning",
            });
            return;
        }
        let stream = this.stream;
        const dual = this.state.mode === "dual" && this.pipStream;
        if (dual) {
            stream = this.composeDualStream();
        }
        const mimeType = VIDEO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
        const options = { videoBitsPerSecond: 2500000 };
        if (mimeType) {
            options.mimeType = mimeType;
        }
        this.recorder = new MediaRecorder(stream, options);
        this.chunks = [];
        this.recorder.ondataavailable = (ev) => ev.data.size && this.chunks.push(ev.data);
        const posterPromise = (async () => {
            const frame = this.grabFrame(1280);
            return frame ? canvasToBlob(frame, 0.85) : null;
        })();
        const startedAt = Date.now();
        this.recorder.onstop = async () => {
            cancelAnimationFrame(this.drawLoop);
            if (this.discardRecording) {
                this.discardRecording = false;
                return;
            }
            const type = (this.recorder.mimeType || "video/webm").split(";")[0];
            const blob = new Blob(this.chunks, { type });
            const extension = type.includes("mp4") ? "mp4" : "webm";
            this.addCapture({
                blob,
                poster: await posterPromise,
                mediaType: "video",
                filename: `video-${startedAt}.${extension}`,
                duration: (Date.now() - startedAt) / 1000,
                dual: Boolean(dual),
                capturedAt: startedAt,
            });
        };
        this.recorder.start(1000);
        this.state.recording = true;
        this.state.recSeconds = 0;
        this.recTimer = setInterval(() => {
            this.state.recSeconds++;
            if (this.state.recSeconds >= MAX_VIDEO_SECONDS) {
                this.stopRecording();
                this.notification.add(_t("Videos can last up to 4 minutes. Recording stopped and saved."), {
                    type: "info",
                });
            }
        }, 1000);
    }

    /** Back camera full screen + front camera picture-in-picture, drawn on a canvas. */
    composeDualStream() {
        const main = this.videoRef.el;
        const pip = this.pipRef.el;
        const canvas = document.createElement("canvas");
        canvas.width = main.videoWidth || 1280;
        canvas.height = main.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        const draw = () => {
            ctx.drawImage(main, 0, 0, canvas.width, canvas.height);
            const pipWidth = canvas.width * 0.28;
            const pipHeight = pipWidth * ((pip.videoHeight || 3) / (pip.videoWidth || 4));
            const margin = canvas.width * 0.025;
            const x = canvas.width - pipWidth - margin;
            const y = canvas.height - pipHeight - margin;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect?.(x, y, pipWidth, pipHeight, margin / 1.5);
            ctx.clip();
            // mirror the selfie camera so it looks natural
            ctx.translate(x + pipWidth, y);
            ctx.scale(-1, 1);
            ctx.drawImage(pip, 0, 0, pipWidth, pipHeight);
            ctx.restore();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.strokeRect(x, y, pipWidth, pipHeight);
            this.drawLoop = requestAnimationFrame(draw);
        };
        draw();
        const composed = canvas.captureStream(30);
        this.stream.getAudioTracks().forEach((track) => composed.addTrack(track));
        return composed;
    }

    stopRecording(discard = false) {
        clearInterval(this.recTimer);
        if (this.recorder && this.recorder.state !== "inactive") {
            this.discardRecording = discard;
            this.recorder.stop();
        }
        this.state.recording = false;
    }

    openUpload() {
        this.fileRef.el.click();
    }

    async onFilesSelected(ev) {
        const files = [...ev.target.files];
        ev.target.value = "";
        for (const file of files) {
            const isVideo = file.type.startsWith("video/");
            if (!isVideo && !file.type.startsWith("image/")) {
                continue;
            }
            const { poster, duration } = isVideo ? await this.videoPosterFromFile(file) : {};
            this.addCapture({
                blob: file,
                poster,
                duration,
                mediaType: isVideo ? "video" : "photo",
                filename: file.name,
                capturedAt: file.lastModified || Date.now(),
                // the location of an uploaded file is unknown: do not stamp the current one
                noLocation: true,
            });
        }
    }

    /** First frame (as JPEG) and duration of a video file chosen from the device. */
    videoPosterFromFile(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";
            let finished = false;
            const done = (poster) => {
                if (finished) {
                    return;
                }
                finished = true;
                URL.revokeObjectURL(url);
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                resolve({ poster, duration });
            };
            video.onloadeddata = () => {
                video.currentTime = Math.min(1, (video.duration || 2) / 2);
            };
            video.onseeked = async () => {
                const canvas = document.createElement("canvas");
                const ratio = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
                canvas.width = Math.round(video.videoWidth * ratio);
                canvas.height = Math.round(video.videoHeight * ratio);
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                done(await canvasToBlob(canvas, 0.85));
            };
            video.onerror = () => done(null);
            setTimeout(() => done(null), 8000);
            video.src = url;
        });
    }

    // ------------------------------------------------------------------
    // Upload queue
    // ------------------------------------------------------------------
    addCapture({ blob, poster, mediaType, filename, duration, dual, capturedAt, noLocation }) {
        const item = {
            uid: newCaptureUid(),
            blob,
            poster: poster || null,
            mediaType,
            filename,
            duration: duration || 0,
            dual: Boolean(dual),
            projectId: this.state.project?.id || null,
            capturedAt: capturedAt || Date.now(),
            location: noLocation || !this.state.location ? null : { ...this.state.location },
            tagIds: [...this.state.selectedTagIds],
        };
        this.trackCapture(item);
        queuePut(item);
        this.queue.push(item);
        this.processQueue();
    }

    trackCapture(item) {
        const previewBlob = item.mediaType === "photo" ? item.blob : item.poster;
        const previewUrl = previewBlob ? URL.createObjectURL(previewBlob) : null;
        if (previewUrl) {
            this.objectUrls.push(previewUrl);
        }
        this.state.captures.unshift({
            uid: item.uid,
            previewUrl,
            mediaType: item.mediaType,
            status: "pending",
            photoId: null,
        });
    }

    async restorePendingCaptures() {
        const pending = await queueAll();
        if (!pending.length) {
            return;
        }
        pending.sort((a, b) => a.capturedAt - b.capturedAt).forEach((item) => {
            this.trackCapture(item);
            this.queue.push(item);
        });
        this.notification.add(_t("Uploading %s captures saved on this device.", pending.length), { type: "info" });
        this.processQueue();
    }

    async processQueue() {
        if (this.processing) {
            return;
        }
        this.processing = true;
        while (this.queue.length && navigator.onLine) {
            const item = this.queue[0];
            const capture = this.state.captures.find((c) => c.uid === item.uid);
            if (capture) {
                capture.status = "uploading";
            }
            try {
                const result = await uploadCapture(item);
                this.queue.shift();
                await queueDelete(item.uid);
                if (capture) {
                    capture.status = "done";
                    capture.photoId = result.id;
                }
            } catch (error) {
                if (capture) {
                    capture.status = "error";
                }
                if (error.status && error.status < 500 && error.status !== 408) {
                    // Rejected by the server (e.g. project removed): keep it on the device, stop retrying it
                    this.queue.shift();
                    this.notification.add(_t("A capture could not be saved (error %s). It stays on this device.", error.status), {
                        type: "danger",
                    });
                    continue;
                }
                setTimeout(() => this.processQueue(), 15000);
                break;
            }
        }
        this.processing = false;
    }

    retryUploads() {
        this.state.captures.forEach((c) => c.status === "error" && (c.status = "pending"));
        this.processQueue();
    }

    // ------------------------------------------------------------------
    // Project, tags, navigation
    // ------------------------------------------------------------------
    chooseProject() {
        if (this.state.recording) {
            return;
        }
        this.dialog.add(ProjectPickerDialog, {
            currentId: this.state.project?.id || null,
            allowNone: true,
            onSelect: (project) => {
                this.state.project = project;
                writeLocal("lastProjectId", project?.id || null);
            },
        });
    }

    toggleTags() {
        this.state.showTags = !this.state.showTags;
    }

    toggleTag(tag) {
        const ids = this.state.selectedTagIds;
        const index = ids.indexOf(tag.id);
        if (index >= 0) {
            ids.splice(index, 1);
        } else {
            ids.push(tag.id);
        }
    }

    async openProjectPhotos() {
        if (this.state.recording) {
            return;
        }
        if (!this.state.project) {
            this.action.doAction("tw_companycam.action_companycam_photo");
            return;
        }
        const action = await this.orm.call("project.project", "action_companycam_view_photos", [
            [this.state.project.id],
        ]);
        this.action.doAction(action);
    }

    async close() {
        if (this.state.recording) {
            this.stopRecording();
        }
        try {
            await this.action.restore();
        } catch {
            await this.action.doAction("tw_companycam.action_companycam_feed", { clearBreadcrumbs: true });
        }
    }
}

registry.category("actions").add("tw_companycam.camera", CompanyCamCamera);
