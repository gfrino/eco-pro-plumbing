import { Component, onMounted, onWillStart, useEffect, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ffffff", "#000000"];
const SIZES = { S: 3, M: 6, L: 11 };

/**
 * Markup editor: freehand, arrows, boxes, circles and text on a photo.
 * Shapes are kept in normalised coordinates (0..1) so the markup can be edited again later;
 * the flattened image is saved in image_annotated, the original is never touched.
 */
export class CompanyCamAnnotate extends Component {
    static template = "tw_companycam.AnnotateAction";
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.canvasRef = useRef("canvas");
        this.textRef = useRef("textInput");
        this.photoId = this.props.action.params?.photo_id || this.props.action.context?.active_id;
        this.colors = COLORS;
        this.sizes = Object.keys(SIZES);
        this.tools = [
            { key: "pen", icon: "fa-paint-brush", label: _t("Draw") },
            { key: "arrow", icon: "fa-long-arrow-right", label: _t("Arrow") },
            { key: "rect", icon: "fa-square-o", label: _t("Box") },
            { key: "ellipse", icon: "fa-circle-o", label: _t("Circle") },
            { key: "text", icon: "fa-font", label: _t("Text") },
        ];
        this.state = useState({
            tool: "arrow",
            color: COLORS[0],
            size: "M",
            shapes: [],
            redo: [],
            loading: true,
            saving: false,
            name: "",
            text: null, // {x, y, left, top, value} while typing
        });

        useEffect(
            (el) => el?.focus(),
            () => [this.textRef.el]
        );

        onWillStart(async () => {
            if (!this.photoId) {
                return;
            }
            const [photo] = await this.orm.read("companycam.photo", [this.photoId], [
                "name",
                "annotation_json",
                "write_date",
            ]);
            this.state.name = photo.name;
            try {
                this.state.shapes = JSON.parse(photo.annotation_json || "[]");
            } catch {
                this.state.shapes = [];
            }
            this.image = await this.loadImage(
                `/web/image/companycam.photo/${this.photoId}/image_1920?unique=${(photo.write_date || "").replace(/\D/g, "")}`
            );
        });

        onMounted(() => {
            if (!this.image) {
                return;
            }
            const canvas = this.canvasRef.el;
            canvas.width = this.image.naturalWidth;
            canvas.height = this.image.naturalHeight;
            this.ctx = canvas.getContext("2d");
            this.state.loading = false;
            this.render2d();
        });
    }

    loadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    get unit() {
        const canvas = this.canvasRef.el;
        return Math.max(canvas.width, canvas.height) / 1000;
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------
    render2d(preview = null) {
        const ctx = this.ctx;
        const { width, height } = this.canvasRef.el;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(this.image, 0, 0, width, height);
        for (const shape of [...this.state.shapes, ...(preview ? [preview] : [])]) {
            this.drawShape(shape, width, height);
        }
    }

    drawShape(shape, width, height) {
        const ctx = this.ctx;
        const lw = SIZES[shape.size] * this.unit;
        const px = ([x, y]) => [x * width, y * height];
        ctx.save();
        ctx.strokeStyle = shape.color;
        ctx.fillStyle = shape.color;
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = lw;
        if (shape.type === "pen") {
            ctx.beginPath();
            shape.points.forEach((point, i) => {
                const [x, y] = px(point);
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            });
            ctx.stroke();
        } else if (shape.type === "arrow") {
            const [x1, y1] = px(shape.from);
            const [x2, y2] = px(shape.to);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const head = lw * 4;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
            ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
            ctx.closePath();
            ctx.fill();
        } else if (shape.type === "rect") {
            const [x1, y1] = px(shape.from);
            const [x2, y2] = px(shape.to);
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        } else if (shape.type === "ellipse") {
            const [x1, y1] = px(shape.from);
            const [x2, y2] = px(shape.to);
            ctx.beginPath();
            ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (shape.type === "text") {
            const [x, y] = px(shape.at);
            const fontSize = lw * 7;
            ctx.font = `bold ${fontSize}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
            ctx.textBaseline = "top";
            ctx.shadowBlur = 0;
            ctx.lineWidth = fontSize / 6;
            ctx.strokeStyle = shape.color === "#000000" ? "#ffffff" : "#000000";
            shape.text.split("\n").forEach((line, i) => {
                ctx.strokeText(line, x, y + i * fontSize * 1.2);
                ctx.fillText(line, x, y + i * fontSize * 1.2);
            });
        }
        ctx.restore();
    }

    pointFromEvent(ev) {
        const rect = this.canvasRef.el.getBoundingClientRect();
        return [
            Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
            Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
        ];
    }

    onPointerDown(ev) {
        if (this.state.loading || this.state.saving) {
            return;
        }
        if (this.state.text) {
            this.commitText();
            return;
        }
        const point = this.pointFromEvent(ev);
        if (this.state.tool === "text") {
            const rect = this.canvasRef.el.getBoundingClientRect();
            const host = this.canvasRef.el.parentElement.getBoundingClientRect();
            this.state.text = {
                at: point,
                left: ev.clientX - host.left,
                top: ev.clientY - host.top,
                value: "",
                fontPx: (SIZES[this.state.size] * this.unit * 7 * rect.width) / this.canvasRef.el.width,
            };
            ev.preventDefault(); // keep the focus for the text box
            return;
        }
        ev.target.setPointerCapture?.(ev.pointerId);
        const base = { type: this.state.tool, color: this.state.color, size: this.state.size };
        this.current =
            this.state.tool === "pen" ? { ...base, points: [point] } : { ...base, from: point, to: point };
        this.render2d(this.current);
    }

    onPointerMove(ev) {
        if (!this.current) {
            return;
        }
        const point = this.pointFromEvent(ev);
        if (this.current.type === "pen") {
            this.current.points.push(point);
        } else {
            this.current.to = point;
        }
        this.render2d(this.current);
    }

    onPointerUp() {
        if (!this.current) {
            return;
        }
        const shape = this.current;
        this.current = null;
        const tiny =
            shape.type !== "pen" && Math.hypot(shape.to[0] - shape.from[0], shape.to[1] - shape.from[1]) < 0.005;
        if (!tiny) {
            this.state.shapes.push(shape);
            this.state.redo = [];
        }
        this.render2d();
    }

    onTextKeydown(ev) {
        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            this.commitText();
        } else if (ev.key === "Escape") {
            this.state.text = null;
        }
    }

    commitText() {
        const text = this.state.text;
        this.state.text = null;
        if (text?.value.trim()) {
            this.state.shapes.push({
                type: "text",
                color: this.state.color,
                size: this.state.size,
                at: text.at,
                text: text.value.trim(),
            });
            this.state.redo = [];
            this.render2d();
        }
    }

    // ------------------------------------------------------------------
    // Toolbar
    // ------------------------------------------------------------------
    setTool(tool) {
        this.commitText();
        this.state.tool = tool;
    }

    undo() {
        const shape = this.state.shapes.pop();
        if (shape) {
            this.state.redo.push(shape);
            this.render2d();
        }
    }

    redoLast() {
        const shape = this.state.redo.pop();
        if (shape) {
            this.state.shapes.push(shape);
            this.render2d();
        }
    }

    clearAll() {
        if (!this.state.shapes.length) {
            return;
        }
        this.state.redo = [...this.state.shapes].reverse();
        this.state.shapes = [];
        this.render2d();
    }

    async save() {
        this.commitText();
        this.state.saving = true;
        const hasShapes = this.state.shapes.length > 0;
        try {
            await this.orm.write("companycam.photo", [this.photoId], {
                image_annotated: hasShapes ? this.canvasRef.el.toDataURL("image/jpeg", 0.9).split(",")[1] : false,
                annotation_json: hasShapes ? JSON.stringify(this.state.shapes) : false,
            });
        } catch (error) {
            this.state.saving = false;
            throw error;
        }
        this.notification.add(hasShapes ? _t("Markup saved. The original photo is kept.") : _t("Markup removed."), {
            type: "success",
        });
        await this.back();
    }

    async back() {
        try {
            await this.action.restore();
        } catch {
            await this.action.doAction({
                type: "ir.actions.act_window",
                res_model: "companycam.photo",
                res_id: this.photoId,
                views: [[false, "form"]],
            });
        }
    }
}

registry.category("actions").add("tw_companycam.annotate", CompanyCamAnnotate);
