import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { _t } from "@web/core/l10n/translation";
import { deserializeDateTime, formatDateTime } from "@web/core/l10n/dates";
import { user } from "@web/core/user";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { ProjectPickerDialog } from "../project_picker/project_picker";
import { photoImageUrl } from "../companycam_utils";

const PAGE_SIZE = 120;
const THUMBS_PER_CARD = 8;
const FIELDS = [
    "name",
    "description",
    "project_id",
    "user_id",
    "captured_at",
    "media_type",
    "has_annotation",
    "write_date",
    "tag_ids",
    "has_location",
    "map_url",
];

/** Project feed: the latest captures of the whole team, grouped like an activity stream. */
export class CompanyCamFeed extends Component {
    static template = "tw_companycam.FeedAction";
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.photoImageUrl = photoImageUrl;
        this.state = useState({
            photos: [],
            tags: {},
            loading: true,
            hasMore: false,
            onlyMine: false,
            mediaType: "all",
            project: null,
            lightbox: null, // index in state.photos
        });

        useHotkey("escape", () => this.closeLightbox(), { isAvailable: () => this.state.lightbox !== null });
        useHotkey("arrowleft", () => this.moveLightbox(-1), { isAvailable: () => this.state.lightbox !== null });
        useHotkey("arrowright", () => this.moveLightbox(1), { isAvailable: () => this.state.lightbox !== null });

        onWillStart(async () => {
            const tags = await this.orm.searchRead("companycam.tag", [], ["name", "color"]);
            this.state.tags = Object.fromEntries(tags.map((t) => [t.id, t]));
            await this.load();
        });
    }

    get domain() {
        const domain = [];
        if (this.state.onlyMine) {
            domain.push(["user_id", "=", user.userId]);
        }
        if (this.state.mediaType !== "all") {
            domain.push(["media_type", "=", this.state.mediaType]);
        }
        if (this.state.project) {
            domain.push(["project_id", "=", this.state.project.id]);
        }
        return domain;
    }

    async load(append = false) {
        this.state.loading = true;
        const offset = append ? this.state.photos.length : 0;
        const records = await this.orm.searchRead("companycam.photo", this.domain, FIELDS, {
            limit: PAGE_SIZE + 1,
            offset,
            order: "captured_at desc, id desc",
        });
        this.state.hasMore = records.length > PAGE_SIZE;
        const page = records.slice(0, PAGE_SIZE);
        this.state.photos = append ? [...this.state.photos, ...page] : page;
        this.state.loading = false;
    }

    /** Consecutive captures of the same person on the same project and day become one card. */
    get activities() {
        const activities = [];
        let current = null;
        this.state.photos.forEach((photo, index) => {
            const when = deserializeDateTime(photo.captured_at);
            const day = when.toISODate();
            const key = `${photo.project_id?.[0]}-${photo.user_id?.[0]}-${day}`;
            if (!current || current.groupKey !== key) {
                current = { key: `${key}-${index}`, groupKey: key, items: [], when, project: photo.project_id, user: photo.user_id };
                activities.push(current);
            }
            current.items.push({ photo, index });
        });
        return activities;
    }

    activityTitle(activity) {
        const photos = activity.items.filter((i) => i.photo.media_type === "photo").length;
        const videos = activity.items.length - photos;
        const parts = [];
        if (photos) {
            parts.push(photos === 1 ? _t("1 photo") : _t("%s photos", photos));
        }
        if (videos) {
            parts.push(videos === 1 ? _t("1 video") : _t("%s videos", videos));
        }
        return _t("added %s", parts.join(_t(" and ")));
    }

    relativeTime(dt) {
        const hours = Math.abs(dt.diffNow("hours").hours);
        return hours < 24 ? dt.toRelative() : formatDateTime(dt, { showSeconds: false });
    }

    photoTime(photo) {
        return this.relativeTime(deserializeDateTime(photo.captured_at));
    }

    visibleItems(activity) {
        return activity.items.slice(0, THUMBS_PER_CARD);
    }

    hiddenCount(activity) {
        return Math.max(0, activity.items.length - THUMBS_PER_CARD);
    }

    tagList(photo) {
        return photo.tag_ids.map((id) => this.state.tags[id]).filter(Boolean);
    }

    // ------------------------------------------------------------------
    // Filters
    // ------------------------------------------------------------------
    async toggleMine() {
        this.state.onlyMine = !this.state.onlyMine;
        await this.load();
    }

    async setMediaType(type) {
        this.state.mediaType = type;
        await this.load();
    }

    pickProject() {
        this.dialog.add(ProjectPickerDialog, {
            currentId: this.state.project?.id || null,
            onSelect: async (project) => {
                this.state.project = project;
                await this.load();
            },
        });
    }

    async clearProject() {
        this.state.project = null;
        await this.load();
    }

    // ------------------------------------------------------------------
    // Navigation
    // ------------------------------------------------------------------
    openCamera() {
        this.action.doAction("tw_companycam.action_companycam_camera", {
            additionalContext: this.state.project ? { default_project_id: this.state.project.id } : {},
        });
    }

    async openProject(projectId) {
        const action = await this.orm.call("project.project", "action_companycam_view_photos", [[projectId]]);
        this.action.doAction(action);
    }

    openLightbox(index) {
        this.state.lightbox = index;
    }

    closeLightbox() {
        this.state.lightbox = null;
    }

    get lightboxPhoto() {
        return this.state.lightbox === null ? null : this.state.photos[this.state.lightbox];
    }

    moveLightbox(step) {
        const next = this.state.lightbox + step;
        if (next >= 0 && next < this.state.photos.length) {
            this.state.lightbox = next;
        }
    }

    openPhotoForm(photo) {
        this.closeLightbox();
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "companycam.photo",
            res_id: photo.id,
            views: [[false, "form"]],
        });
    }

    async annotate(photo) {
        this.closeLightbox();
        const action = await this.orm.call("companycam.photo", "action_companycam_annotate", [[photo.id]]);
        this.action.doAction(action);
    }
}

registry.category("actions").add("tw_companycam.feed", CompanyCamFeed);
