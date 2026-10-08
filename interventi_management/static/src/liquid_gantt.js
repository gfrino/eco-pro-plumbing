/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart, useState } from "@odoo/owl";

export class LiquidGanttDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        
        this.state = useState({
            startDate: new Date(),
            days: 7,
            mode: 'week',
            employees: [],
            interventions: [],
            isDragging: false,
            showWeekends: false,
        });

        this.state.startDate.setHours(0,0,0,0);
        this.alignStartDate();

        this.resizeState = {
            active: false,
            invId: null,
            startY: 0,
            startHeight: 0,
            startDuration: 0,
            cardElement: null
        };
        this._onResizeMove = this.onResizeMove.bind(this);
        this._onResizeEnd = this.onResizeEnd.bind(this);

        onWillStart(async () => {
            await this.fetchData();
        });
    }

    onWeekendToggle(ev) {
        this.state.showWeekends = ev.target.checked;
        this.fetchData();
    }

    alignStartDate() {
        if (this.state.mode === 'week') {
            const day = this.state.startDate.getDay();
            const diff = this.state.startDate.getDate() - day + (day === 0 ? -6 : 1);
            this.state.startDate.setDate(diff);
            this.state.days = 7;
        } else if (this.state.mode === 'month') {
            this.state.startDate.setDate(1);
            const year = this.state.startDate.getFullYear();
            const month = this.state.startDate.getMonth();
            this.state.days = new Date(year, month + 1, 0).getDate();
        } else if (this.state.mode === 'day') {
            this.state.days = 1;
        }
    }

    setMode(mode) {
        this.state.startDate = new Date();
        this.state.startDate.setHours(0,0,0,0);
        this.state.mode = mode;
        this.alignStartDate();
        this.fetchData();
    }

    async fetchData() {
        const startDateStr = this.formatDate(this.state.startDate);
        const endDateObj = new Date(this.state.startDate);
        endDateObj.setDate(endDateObj.getDate() + this.state.days);
        const endDateStr = this.formatDate(endDateObj);

        const data = await this.orm.call('interventi.intervento', 'get_gantt_data', [startDateStr, endDateStr, this.state.mode]);
        this.state.employees = data.employees;
        
        let empColorMap = {};
        for(let e of data.employees) {
            empColorMap[e.id] = this.getUserColorHex(e.color || 0);
        }
        for(let inv of data.interventions) {
            let uid = inv.user_id ? inv.user_id[0] : 0;
            inv.colorHex = empColorMap[uid] || '#3b82f6';
        }
        
        this.state.interventions = data.interventions;
        this.preprocessGanttTasks();
    }

    getUserColorHex(colorIndex) {
        const colors = [
            '#e2e8f0', '#f06050', '#f4a460', '#f7cd1f',
            '#6cc1ed', '#814968', '#eb7e7f', '#2c8397',
            '#475577', '#d6145f', '#30c381', '#9365b8'
        ];
        return colors[colorIndex % 12] || '#3b82f6';
    }

    formatDuration(dur) {
        if (!dur) return 0;
        return Math.round(dur * 100) / 100;
    }

    formatDate(dateObj) {
        return dateObj.toISOString().slice(0, 19).replace('T', ' ');
    }

    getTimeSlots() {
        const slots = [];
        const start = new Date(this.state.startDate);
        if (this.state.mode === 'day') {
            for (let i = 8; i < 22; i++) {
                const d = new Date(start);
                d.setHours(i, 0, 0, 0);
                slots.push({
                    type: 'hour',
                    date: d,
                    label: `${i.toString().padStart(2, '0')}:00`,
                    sublabel: ''
                });
            }
        } else {
            for(let i=0; i<this.state.days; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                if (!this.state.showWeekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
                slots.push({
                    type: 'day',
                    date: d,
                    label: `${d.getDate()} ${d.toLocaleDateString('en-US', {month: 'short'})}`,
                    sublabel: d.toLocaleDateString('en-US', {weekday: 'short'})
                });
            }
        }
        return slots;
    }
    
    get xAxisItems() {
        return this.state.mode === 'day' ? this.state.employees : this.getTimeSlots();
    }
    
    get yAxisItems() {
        return this.state.mode === 'day' ? this.getTimeSlots() : this.state.employees;
    }
    
    preprocessGanttTasks() {
        this.state.ganttTasks = {};
        this.state.rowHeights = {};
        if (this.state.mode === 'day') {
            this.computeDayOverlaps();
            return;
        }

        const viewStart = new Date(this.state.startDate);
        const viewEnd = new Date(this.state.startDate);
        viewEnd.setDate(viewEnd.getDate() + this.state.days);

        for (let emp of this.state.employees) {
            let empInvs = this.state.interventions.filter(i => i.user_id && i.user_id[0] === emp.id);
            empInvs.sort((a, b) => new Date(a.date + (a.date.endsWith('Z') ? '' : 'Z')) - new Date(b.date + (b.date.endsWith('Z') ? '' : 'Z')));

            let tasksForEmp = [];
            let dayGroups = {};

            for (let inv of empInvs) {
                let start = new Date(inv.date + (inv.date.endsWith('Z') ? '' : 'Z'));
                if (start < viewStart || start >= viewEnd) continue;

                let startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                let viewLocal = new Date(viewStart.getFullYear(), viewStart.getMonth(), viewStart.getDate());
                let dayIndex = Math.round((startLocal - viewLocal) / 86400000);

                if (!dayGroups[dayIndex]) dayGroups[dayIndex] = [];
                dayGroups[dayIndex].push(inv);
            }

            let maxTracks = 0;

            const xAxisItems = this.getTimeSlots();
            const totalVisibleDays = xAxisItems.length;
            
            let visibleColMapping = {};
            let colIndex = 0;
            for(let i=0; i<this.state.days; i++) {
                const d = new Date(viewStart.getFullYear(), viewStart.getMonth(), viewStart.getDate());
                d.setDate(d.getDate() + i);
                if (!this.state.showWeekends && (d.getDay() === 0 || d.getDay() === 6)) {
                    visibleColMapping[i] = -1;
                } else {
                    visibleColMapping[i] = colIndex++;
                }
            }

            for (let dayIndex in dayGroups) {
                let mappedCol = visibleColMapping[dayIndex];
                if (mappedCol === undefined || mappedCol === -1) continue;
                
                let invsInDay = dayGroups[dayIndex];
                
                let partnerGroups = {};
                let partnerTracks = {};
                let currentTrack = 0;

                for (let inv of invsInDay) {
                    let pId = inv.partner_id ? inv.partner_id[0] : 'none';
                    if (!(pId in partnerGroups)) {
                        partnerGroups[pId] = [];
                        partnerTracks[pId] = currentTrack++;
                    }
                    partnerGroups[pId].push(inv);
                }
                
                if (currentTrack > maxTracks) maxTracks = currentTrack;

                for (let pId in partnerGroups) {
                    let invsForPartner = partnerGroups[pId];
                    let N = invsForPartner.length;
                    let track = partnerTracks[pId];

                    for (let i = 0; i < N; i++) {
                        let inv = invsForPartner[i];
                        let cellWidthPct = 100 / totalVisibleDays;
                        let cellLeftPct = mappedCol * cellWidthPct;
                        
                        let slotWidthPct = cellWidthPct / N;
                        let slotLeftPct = cellLeftPct + (i * slotWidthPct);

                        tasksForEmp.push({
                            inv: inv,
                            track: track,
                            left: slotLeftPct,
                            width: slotWidthPct,
                            is_partial: false
                        });
                    }
                }
            }

            this.state.ganttTasks[emp.id] = tasksForEmp;
            this.state.rowHeights[emp.id] = Math.max(1, maxTracks) * 45;
        }
    }

    computeDayOverlaps() {
        const viewStart = new Date(this.state.startDate);
        viewStart.setHours(0,0,0,0);
        const viewEnd = new Date(viewStart);
        viewEnd.setDate(viewEnd.getDate() + 1);

        for (let emp of this.state.employees) {
            let empInvs = this.state.interventions.filter(i => {
                let uid = i.user_id ? i.user_id[0] : 0;
                return uid === emp.id;
            });

            let visibleInvs = empInvs.map(inv => {
                let dStr = inv.date;
                if (!dStr.endsWith('Z')) dStr += 'Z';
                let start = new Date(dStr);
                let end = new Date(start.getTime() + (inv.duration * 60 * 60 * 1000));
                return { inv: inv, start: start, end: end, col: 0, maxCol: 1 };
            }).filter(item => item.start < viewEnd && item.end > viewStart);

            visibleInvs.sort((a, b) => a.start - b.start || a.end - b.end);

            let clusters = [];
            let currentCluster = [];
            let clusterEnd = null;

            for (let item of visibleInvs) {
                if (currentCluster.length === 0) {
                    currentCluster.push(item);
                    clusterEnd = item.end;
                } else {
                    if (item.start < clusterEnd) {
                        currentCluster.push(item);
                        if (item.end > clusterEnd) clusterEnd = item.end;
                    } else {
                        clusters.push(currentCluster);
                        currentCluster = [item];
                        clusterEnd = item.end;
                    }
                }
            }
            if (currentCluster.length > 0) {
                clusters.push(currentCluster);
            }

            for (let cluster of clusters) {
                let columns = []; 
                for (let item of cluster) {
                    let placed = false;
                    for (let c = 0; c < columns.length; c++) {
                        if (item.start >= columns[c]) {
                            item.col = c;
                            columns[c] = item.end;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        item.col = columns.length;
                        columns.push(item.end);
                    }
                }
                for (let item of cluster) {
                    item.maxCol = columns.length;
                    item.inv.dayLeft = (item.col / item.maxCol) * 100;
                    item.inv.dayWidth = (1 / item.maxCol) * 100;
                }
            }
        }
    }

    getGanttTasksForRow(yItem) {
        if (this.state.mode === 'day') return [];
        return this.state.ganttTasks[yItem.id] || [];
    }

    getRowHeight(yItem) {
        if (this.state.mode === 'day') return 'auto';
        return `${this.state.rowHeights[yItem.id] || 45}px`;
    }

    getInterventionsForCell(yItem, xItem) {
        const slot = this.state.mode === 'day' ? yItem : xItem;
        const empId = this.state.mode === 'day' ? xItem.id : yItem.id;
        
        const startOfSlot = new Date(slot.date);
        const endOfSlot = new Date(slot.date);
        if (slot.type === 'hour') endOfSlot.setHours(endOfSlot.getHours() + 1);
        else endOfSlot.setDate(endOfSlot.getDate() + 1);
        
        return this.state.interventions.filter(inv => {
            let dateStr = inv.date;
            if (!dateStr.endsWith('Z')) dateStr += 'Z';
            const invDate = new Date(dateStr);
            const matchSlot = invDate >= startOfSlot && invDate < endOfSlot;
            const uid = inv.user_id ? inv.user_id[0] : 0;
            return matchSlot && uid === empId;
        }).sort((a, b) => new Date(a.date + (a.date.endsWith('Z') ? '' : 'Z')) - new Date(b.date + (b.date.endsWith('Z') ? '' : 'Z')));
    }

    formatTime(dateStr) {
        let dStr = dateStr;
        if (!dStr.endsWith('Z')) dStr += 'Z';
        const d = new Date(dStr);
        return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    formatTimeRange(dateStr, duration) {
        let dStr = dateStr;
        if (!dStr.endsWith('Z')) dStr += 'Z';
        const start = new Date(dStr);
        const end = new Date(start.getTime() + duration * 3600000);
        return start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ' - ' + end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    getMinutesOffset(dateStr) {
        if (!dateStr) return 0;
        let dStr = dateStr;
        if (!dStr.endsWith('Z')) dStr += 'Z';
        return new Date(dStr).getMinutes();
    }

    prev() {
        if (this.state.mode === 'day') {
            this.state.startDate.setDate(this.state.startDate.getDate() - 1);
        } else if (this.state.mode === 'week') {
            this.state.startDate.setDate(this.state.startDate.getDate() - 7);
        } else if (this.state.mode === 'month') {
            this.state.startDate.setMonth(this.state.startDate.getMonth() - 1);
            this.alignStartDate();
        }
        this.fetchData();
    }
    
    next() {
        if (this.state.mode === 'day') {
            this.state.startDate.setDate(this.state.startDate.getDate() + 1);
        } else if (this.state.mode === 'week') {
            this.state.startDate.setDate(this.state.startDate.getDate() + 7);
        } else if (this.state.mode === 'month') {
            this.state.startDate.setMonth(this.state.startDate.getMonth() + 1);
            this.alignStartDate();
        }
        this.fetchData();
    }

    onDragStart(ev, invId) {
        ev.dataTransfer.setData('text/plain', invId.toString());
        ev.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            ev.target.style.opacity = '0.4';
        }, 0);
        this.state.isDragging = true;
    }

    onDragEnd(ev) {
        ev.target.style.opacity = '1';
        this.state.isDragging = false;
    }

    onDragEnter(ev) {
        ev.preventDefault();
        ev.currentTarget.classList.add('bg-primary', 'bg-opacity-10');
    }

    onDragLeave(ev) {
        ev.currentTarget.classList.remove('bg-primary', 'bg-opacity-10');
    }

    onDragOver(ev) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
    }

    async onDrop(ev, yItem, xItem) {
        ev.preventDefault();
        ev.currentTarget.classList.remove('bg-primary', 'bg-opacity-10');
        this.state.isDragging = false;
        const slot = this.state.mode === 'day' ? yItem : xItem;
        const targetEmpId = this.state.mode === 'day' ? xItem.id : yItem.id;

        const invIdStr = ev.dataTransfer.getData('text/plain');
        if (!invIdStr) return;
        const invId = parseInt(invIdStr);

        // Find original intervention to extract time
        const inv = this.state.interventions.find(i => i.id === invId);
        if (!inv) return;

        // Extract original time from inv.date
        let dateStr = inv.date;
        if (!dateStr.endsWith('Z')) dateStr += 'Z';
        const origDate = new Date(dateStr);
        
        // Create new date based on slot
        const newDate = new Date(slot.date);
        if (slot.type === 'hour') {
            newDate.setMinutes(origDate.getMinutes(), 0, 0);
        } else {
            newDate.setHours(origDate.getHours(), origDate.getMinutes(), 0, 0);
        }

        // Format to UTC string for Odoo
        const newDateStr = this.formatDate(newDate);

        // Update record in backend
        await this.orm.write('interventi.intervento.slot', [invId], {
            user_id: targetEmpId === 0 ? false : targetEmpId,
            date_start: newDateStr
        });

        // Refresh data
        await this.fetchData();
    }

    createNewJob() {
        this.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'interventi.intervento',
            views: [[false, 'form']],
            target: 'new',
        }, {
            onClose: () => {
                this.fetchData();
            }
        });
    }

    openIntervention(id) {
        const slot = this.state.interventions.find(i => i.id === id);
        if (!slot) return;
        
        this.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'interventi.intervento',
            res_id: slot.intervento_id ? slot.intervento_id[0] : false,
            views: [[false, 'form']],
            target: 'new',
        }, {
            onClose: () => {
                this.fetchData();
            }
        });
    }

    onResizeStart(ev, inv) {
        ev.stopPropagation();
        ev.preventDefault(); // Prevents HTML5 drag from starting
        this.resizeState = {
            active: true,
            invId: inv.id,
            startY: ev.clientY,
            startDuration: inv.duration || 1,
            cardElement: ev.target.closest('.liquid-bar')
        };
        this.resizeState.startHeight = this.resizeState.cardElement.getBoundingClientRect().height;
        
        document.body.classList.add('resizing');
        window.addEventListener('mousemove', this._onResizeMove);
        window.addEventListener('mouseup', this._onResizeEnd);
    }

    onResizeMove(ev) {
        if (!this.resizeState.active) return;
        ev.preventDefault();
        const deltaY = ev.clientY - this.resizeState.startY;
        // 60px = 1 hour. Snap to 15 min (0.25h -> 15px)
        let deltaDuration = Math.round(deltaY / 15) * 0.25;
        let newDuration = Math.max(0.25, this.resizeState.startDuration + deltaDuration);
        
        if (this.resizeState.cardElement) {
            this.resizeState.cardElement.style.height = `${newDuration * 60}px`;
        }
        this.resizeState.newDuration = newDuration;
    }

    async onResizeEnd(ev) {
        if (!this.resizeState.active) return;
        this.resizeState.active = false;
        
        document.body.classList.remove('resizing');
        window.removeEventListener('mousemove', this._onResizeMove);
        window.removeEventListener('mouseup', this._onResizeEnd);
        
        const invId = this.resizeState.invId;
        const newDuration = this.resizeState.newDuration;
        
        if (newDuration && newDuration !== this.resizeState.startDuration) {
            await this.orm.write('interventi.intervento.slot', [invId], {
                duration: newDuration
            });
            await this.fetchData();
        } else {
            if (this.resizeState.cardElement) {
                this.resizeState.cardElement.style.height = `${this.resizeState.startDuration * 60}px`;
            }
        }
    }
}

LiquidGanttDashboard.template = "interventi_management.LiquidGanttDashboard";

registry.category("actions").add("interventi_gantt_dashboard", LiquidGanttDashboard);
