/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { SectionAndNoteListRenderer } from "@account/components/section_and_note_fields_backend/section_and_note_fields_backend";

const FORMAT_NOTE_ACTION = "action_eco_format_note";

// Note lines are drawn with only the handle + text, so the "Format note" brush
// button would never appear: keep its column for note lines.
patch(SectionAndNoteListRenderer.prototype, {
    getSectionColumns(columns, record) {
        const sectionColumns = super.getSectionColumns(...arguments);
        if (!record || record.data.display_type !== "line_note") {
            return sectionColumns;
        }
        const formatColumn = columns.find(
            (col) =>
                col.type === "button_group" &&
                col.buttons?.some((button) => button.name === FORMAT_NOTE_ACTION)
        );
        if (!formatColumn) {
            return sectionColumns;
        }
        return [
            ...sectionColumns.map((col) =>
                col.name === this.titleField && col.colspan > 1
                    ? { ...col, colspan: col.colspan - 1 }
                    : col
            ),
            { ...formatColumn },
        ];
    },
});
