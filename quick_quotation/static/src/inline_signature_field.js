/** @odoo-module **/
import { Component, useRef, onMounted, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { loadJS } from "@web/core/assets";

export class InlineSignatureField extends Component {
    setup() {
        this.canvasRef = useRef("canvas");
        this.pad = null;
        
        onWillStart(async () => {
            await loadJS("/web/static/lib/signature_pad/signature_pad.umd.js");
        });

        onMounted(() => {
            requestAnimationFrame(() => {
                this.initSignaturePad();
            });
        });
    }

    initSignaturePad() {
        const canvas = this.canvasRef.el;
        if (!canvas || canvas.offsetWidth === 0) {
            // Retry if not yet visible (e.g. inside a modal animating in)
            setTimeout(() => this.initSignaturePad(), 100);
            return;
        }

        // Resize canvas to fit container properly for high PPI
        const ratio =  Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);

        this.pad = new SignaturePad(canvas, {
            minWidth: 1.5,
            maxWidth: 3.5,
            penColor: "rgb(0, 0, 0)"
        });

        // Load existing signature if any
        if (this.props.record.data[this.props.name]) {
            this.pad.fromDataURL("data:image/png;base64," + this.props.record.data[this.props.name]);
        }

        // Save strokes automatically
        this.pad.addEventListener("endStroke", () => {
            const dataURL = this.pad.toDataURL("image/png");
            // extract base64 data
            const base64Data = dataURL.split(",")[1];
            this.props.record.update({ [this.props.name]: base64Data });
        });
    }

    clearSignature(ev) {
        ev.preventDefault();
        if (this.pad) {
            this.pad.clear();
            this.props.record.update({ [this.props.name]: false });
        }
    }
}

InlineSignatureField.template = "quick_quotation.InlineSignatureField";
InlineSignatureField.props = { ...standardFieldProps };

export const inlineSignatureField = {
    component: InlineSignatureField,
    supportedTypes: ["binary"],
};

registry.category("fields").add("inline_signature", inlineSignatureField);
