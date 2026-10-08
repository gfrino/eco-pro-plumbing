/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart, useState } from "@odoo/owl";

export class QuickQuotationDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.defaultPartnerId = this.props.action?.context?.default_partner_id;
        this.state = useState({
            templates: [],
            selectedTemplate: null,
            loading: false,
            customerSearchTerm: "",
            customers: [],
            selectedCustomer: null,
            currencySymbol: "€",
            currencyPosition: "after"
        });

        onWillStart(async () => {
            try {
                const companies = await this.orm.searchRead('res.company', [], ['currency_id'], { limit: 1 });
                if (companies.length > 0 && companies[0].currency_id) {
                    const currencies = await this.orm.searchRead('res.currency', [['id', '=', companies[0].currency_id[0]]], ['symbol', 'position'], { limit: 1 });
                    if (currencies.length > 0) {
                        this.state.currencySymbol = currencies[0].symbol;
                        this.state.currencyPosition = currencies[0].position || 'after';
                    }
                }
            } catch (e) {
                console.warn("Could not fetch currency", e);
            }

            if (this.defaultPartnerId) {
                const partners = await this.orm.searchRead('res.partner', [['id', '=', this.defaultPartnerId]], ['id', 'name']);
                if (partners.length > 0) {
                    this.state.selectedCustomer = partners[0];
                }
            }
            await this.fetchTemplates();
        });
    }

    async fetchTemplates() {
        this.state.loading = true;
        try {
            const templates = await this.orm.searchRead(
                "sale.order.template",
                [], // No domain, get all templates
                ["id", "name", "has_image", "good_total", "better_total", "best_total"]
            );

            const lines = await this.orm.searchRead(
                "sale.order.template.line",
                [],
                ["sale_order_template_id", "version", "name", "product_id", "display_type", "sequence"]
            );

            for (let t of templates) {
                // filter lines belonging to this template, excluding notes/sections
                const tLines = lines.filter(l => 
                    l.sale_order_template_id && 
                    l.sale_order_template_id[0] === t.id && 
                    !['line_note', 'line_section'].includes(l.display_type)
                );
                // sort by sequence
                tLines.sort((a, b) => a.sequence - b.sequence);
                
                t.goodLines = tLines.filter(l => l.version === 'good');
                t.betterLines = tLines.filter(l => l.version === 'better');
                t.bestLines = tLines.filter(l => l.version === 'best');
            }
            
            this.state.templates = templates;
        } finally {
            this.state.loading = false;
        }
    }

    selectTemplate(template) {
        this.state.selectedTemplate = template;
    }

    goBack() {
        this.state.selectedTemplate = null;
    }

    async onCustomerSearch(ev) {
        const val = ev.target.value;
        this.state.customerSearchTerm = val;
        if (val.length >= 2) {
            this.state.customers = await this.orm.searchRead(
                'res.partner',
                [['name', 'ilike', val]],
                ['id', 'name'],
                { limit: 8 }
            );
        } else {
            this.state.customers = [];
        }
    }

    selectCustomer(customer) {
        this.state.selectedCustomer = customer;
        this.state.customerSearchTerm = "";
        this.state.customers = [];
        this.defaultPartnerId = customer.id;
    }

    clearCustomer() {
        this.state.selectedCustomer = null;
        this.state.customerSearchTerm = "";
        this.defaultPartnerId = null;
    }

    formatCurrency(value) {
        if (!value) value = 0;
        const formattedValue = value.toFixed(2);
        if (this.state.currencyPosition === 'before') {
            return `${this.state.currencySymbol} ${formattedValue}`;
        }
        return `${formattedValue} ${this.state.currencySymbol}`;
    }

    goHome() {
        window.location.href = "/web";
    }

    async createQuote(version) {
        if (!this.state.selectedTemplate) return;
        
        let wizardContext = {
            default_template_id: this.state.selectedTemplate.id,
            default_version: version,
        };
        
        if (this.defaultPartnerId) {
            wizardContext['default_partner_id'] = this.defaultPartnerId;
        }
        
        this.action.doAction({
            type: "ir.actions.act_window",
            name: "Sign Quotation",
            res_model: "quick_quotation.signature.wizard",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
            context: wizardContext,
        });
    }
}

QuickQuotationDashboard.template = "quick_quotation.Dashboard";

registry.category("actions").add("quick_quotation.dashboard", QuickQuotationDashboard);
