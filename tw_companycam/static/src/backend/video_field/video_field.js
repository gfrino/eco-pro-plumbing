import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/** Plays the video stored in a binary field, right in the form. */
export class CompanyCamVideoField extends Component {
    static template = "tw_companycam.VideoField";
    static props = { ...standardFieldProps };

    get src() {
        const record = this.props.record;
        const unique = (record.data.write_date?.ts || "").toString();
        return `/web/content/${record.resModel}/${record.resId}/${this.props.name}?unique=${unique}`;
    }

    get poster() {
        const record = this.props.record;
        return `/web/image/${record.resModel}/${record.resId}/image_1024`;
    }

    get hasVideo() {
        return Boolean(this.props.record.resId && this.props.record.data[this.props.name]);
    }
}

export const companyCamVideoField = {
    component: CompanyCamVideoField,
    displayName: _t("Video player"),
    supportedTypes: ["binary"],
};

registry.category("fields").add("companycam_video", companyCamVideoField);
