import { Component, onWillStart, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";
import { _t } from "@web/core/l10n/translation";

/** Pick a job-site project by name, or create it on the spot. */
export class ProjectPickerDialog extends Component {
    static template = "tw_companycam.ProjectPickerDialog";
    static components = { Dialog };
    static props = {
        close: Function,
        onSelect: Function,
        currentId: { type: [Number, { value: null }], optional: true },
        allowNone: { type: Boolean, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ search: "", projects: [], loading: true, creating: false });
        this.debouncedLoad = useDebounced(() => this.load(), 250);
        onWillStart(() => this.load());
    }

    get title() {
        return _t("Choose a project");
    }

    async load() {
        this.state.loading = true;
        const domain = [["is_template", "=", false]];
        if (this.state.search) {
            domain.push("|", "|",
                ["name", "ilike", this.state.search],
                ["partner_id", "ilike", this.state.search],
                ["companycam_address", "ilike", this.state.search]);
        }
        this.state.projects = await this.orm.searchRead(
            "project.project", domain,
            ["name", "partner_id", "companycam_address", "companycam_cover_id"],
            { limit: 40, order: "write_date desc" }
        );
        this.state.loading = false;
    }

    onInput(ev) {
        this.state.search = ev.target.value;
        this.debouncedLoad();
    }

    onKeydown(ev) {
        if (ev.key !== "Enter") {
            return;
        }
        if (this.state.projects.length === 1) {
            this.select(this.state.projects[0]);
        } else if (!this.state.projects.length) {
            this.create();
        }
    }

    select(project) {
        this.props.onSelect(project ? { id: project.id, name: project.name } : null);
        this.props.close();
    }

    async create() {
        const name = this.state.search.trim();
        if (!name || this.state.creating) {
            return;
        }
        this.state.creating = true;
        const [id] = await this.orm.create("project.project", [{ name }]);
        this.select({ id, name });
    }
}
