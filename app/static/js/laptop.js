document.addEventListener('DOMContentLoaded', function () {
    // Clickable rows for item details
    const rows = document.querySelectorAll('.clickable-row');
    rows.forEach(row => {
        row.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            if (id && !isNaN(id) && id.trim() !== '') {
                window.open(`/laptop/item/${id}`, '_blank'); // Adjust URL as needed
            } else {
                console.error('Invalid or missing ID for row:', this);
            }
        });
    });

    const cells = document.querySelectorAll('.clickable-copy');
    cells.forEach(cell => {
        cell.addEventListener('click', function (event) {
            event.stopPropagation();
            navigator.clipboard.writeText(cell.innerHTML);
        });
    });

    // Table sorting functionality
    const table = document.getElementById('rma-table');
    const headers = table.querySelectorAll('th.sortable');
    let currentSort = { column: null, direction: 'asc' };

    headers.forEach(header => {
        header.addEventListener('click', function () {
            const column = this.getAttribute('data-sort');
            const direction =
                column === currentSort.column && currentSort.direction === 'asc'
                    ? 'desc'
                    : 'asc';

            // Update headers to show current sort
            headers.forEach(h => {
                h.textContent = h.textContent.replace(' ↑', ' ↕').replace(' ↓', ' ↕');
            });
            this.textContent = this.textContent.replace(' ↕', direction === 'asc' ? ' ↑' : ' ↓');

            // Sort the table
            sortTable(column, direction);

            // Update current sort
            currentSort = { column, direction };
        });
    });

    function sortTable(column, direction) {
        const rows = Array.from(table.querySelectorAll('tr')).slice(1); // Skip header row
        const columnIndex = Array.from(headers).findIndex(
            header => header.getAttribute('data-sort') === column
        );

        const sorted = rows.sort((a, b) => {
            const aValue = a.cells[columnIndex]?.textContent.trim().toLowerCase() || '';
            const bValue = b.cells[columnIndex]?.textContent.trim().toLowerCase() || '';

            // Handle numeric values
            const aNum = parseFloat(aValue);
            const bNum = parseFloat(bValue);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return direction === 'asc' ? aNum - bNum : bNum - aNum;
            }

            // Handle text values (including empty strings)
            return direction === 'asc'
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });

        // Re-add rows in sorted order
        sorted.forEach(row => table.appendChild(row));
    }

    // Column filter functionality
    const columns = [
        { id: 'toggle-brand', class: 'brand-col' },
        { id: 'toggle-condition', class: 'condition-col' },
        { id: 'toggle-model', class: 'model-col' },
        { id: 'toggle-spec', class: 'spec-col' },
        { id: 'toggle-sn', class: 'sn-col' },
        { id: 'toggle-odoo-ref', class: 'odoo-ref-col' },
        { id: 'toggle-sku', class: 'sku-col' },
        { id: 'toggle-order-number', class: 'order-number-col' },
        { id: 'toggle-stock', class: 'stock-col' },
        { id: 'toggle-sealed', class: 'sealed-col' },
        { id: 'toggle-odoo-record', class: 'odoo-record-col' }
    ];

    function toggleColumn(checkbox, columnClass) {
        const cells = document.querySelectorAll(`.${columnClass}`);
        cells.forEach(cell => {
            cell.classList.toggle('hidden', !checkbox.checked);
        });
    }

    // Initialize column visibility and localStorage
    columns.forEach(column => {
        const checkbox = document.getElementById(column.id);
        if (checkbox) {
            const savedState = localStorage.getItem(column.id);
            checkbox.checked = savedState !== null ? JSON.parse(savedState) : checkbox.checked;
            toggleColumn(checkbox, column.class); // Apply initial state
            checkbox.addEventListener('change', () => {
                localStorage.setItem(column.id, checkbox.checked);
                toggleColumn(checkbox, column.class);
            });
        }
    });

    // Dropdown menu toggle
    const columnFilterBtn = document.getElementById('column-filter-btn');
    const columnFilterMenu = document.getElementById('column-filter-menu');

    if (columnFilterBtn && columnFilterMenu) {
        columnFilterBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            columnFilterMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (event) => {
            if (!columnFilterBtn.contains(event.target) && !columnFilterMenu.contains(event.target)) {
                columnFilterMenu.classList.add('hidden');
            }
        });
    }
    // Handle multiple dropdowns
    const dropdowns = document.querySelectorAll('.multi-select');
    
    dropdowns.forEach(dropdown => {
        const selectBar = dropdown.querySelector('.select-bar');
        const dropdownMenu = dropdown.querySelector('.dropdown');
        const options = dropdown.querySelectorAll('.option');
        const hiddenInput = dropdown.querySelector('input[type="hidden"]');
        let selectedItems = [];

        // Toggle dropdown visibility
        selectBar.addEventListener('click', () => {
            dropdownMenu.classList.toggle('active');
        });

        // Handle option selection
        options.forEach(option => {
            option.addEventListener('click', () => {
                const value = option.getAttribute('data-value');
                if (selectedItems.includes(value)) {
                    selectedItems = selectedItems.filter(item => item !== value);
                    option.classList.remove('selected');
                } else {
                    selectedItems.push(value);
                    option.classList.add('selected');
                }

                // Update display
                selectBar.innerHTML = selectedItems.length > 0 
                    ? selectedItems.map(item => {
                        let className = '';
                        if (hiddenInput.name === 'conditions') {
                            switch (item) {
                                case 'Back to New': className = 'condition-n'; break;
                                case 'Grade A': className = 'condition-a'; break;
                                case 'Grade B': className = 'condition-b'; break;
                                case 'Grade C': className = 'condition-c'; break;
                                case 'Grade F': className = 'condition-f'; break;
                            }
                        }
                        else if (hiddenInput.name === 'inspection_request') {
                            switch (item) {
                                case 'As it': className = 'condition-n'; break;
                                case 'Quick Check': className = 'condition-b'; break;
                                case 'Full inspection': className = 'condition-red'; break;
                            }
                        }
                        return `<span class="selected-item ${className}">${item}</span>`;
                    }).join(' ') 
                    : selectBar.textContent; // Keep original text when nothing selected

                // Update hidden input
                hiddenInput.value = selectedItems.join(',');
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!selectBar.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('active');
            }
        });
    });
});