document.addEventListener('DOMContentLoaded', function () {
    // Clickable rows for item details
    const rows = document.querySelectorAll('.clickable-row');
    rows.forEach(row => {
        row.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            if (id && !isNaN(id) && id.trim() !== '') {
                const pageTitle = document.querySelector('title').textContent;
                let baseUrl = '';
                if (pageTitle.includes('RMA Laptop List')) {
                    baseUrl = '/laptop/item/';
                } else if (pageTitle.includes('RMA Non Laptop List')) {
                    baseUrl = '/non_laptop/item/';
                } else {
                    console.error('Unknown page type');
                    return;
                }
                console.log('Opening URL:', `${baseUrl}${id}`);
                window.open(`${baseUrl}${id}`, '_blank');
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

            headers.forEach(h => {
                h.textContent = h.textContent.replace(' ↑', ' ↕').replace(' ↓', ' ↕');
            });
            this.textContent = this.textContent.replace(' ↕', direction === 'asc' ? ' ↑' : ' ↓');

            sortTable(column, direction);
            currentSort = { column, direction };
        });
    });

    function sortTable(column, direction) {
        const rows = Array.from(table.querySelectorAll('tr')).slice(1);
        const columnIndex = Array.from(headers).findIndex(
            header => header.getAttribute('data-sort') === column
        );

        const sorted = rows.sort((a, b) => {
            const aValue = a.cells[columnIndex]?.textContent.trim().toLowerCase() || '';
            const bValue = b.cells[columnIndex]?.textContent.trim().toLowerCase() || '';
            const aNum = parseFloat(aValue);
            const bNum = parseFloat(bValue);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return direction === 'asc' ? aNum - bNum : bNum - aNum;
            }
            return direction === 'asc'
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });

        sorted.forEach(row => table.appendChild(row));
    }

    // Combined columns for both Laptop and Non-Laptop pages
    const columns = [
        // Laptop-specific columns
        { id: 'toggle-laptop-brand', class: 'brand-laptop-col' },
        { id: 'toggle-laptop-condition', class: 'condition-laptop-col' },
        { id: 'toggle-laptop-model', class: 'model-laptop-col' },
        { id: 'toggle-laptop-spec', class: 'spec-laptop-col' },
        { id: 'toggle-laptop-sn', class: 'sn-laptop-col' },
        { id: 'toggle-laptop-odoo-ref', class: 'odoo-ref-laptop-col' },
        { id: 'toggle-laptop-sku', class: 'sku-laptop-col' },
        { id: 'toggle-laptop-order-number', class: 'order-number-laptop-col' },
        { id: 'toggle-laptop-stock', class: 'stock-laptop-col' },
        { id: 'toggle-laptop-sealed', class: 'sealed-laptop-col' },
        { id: 'toggle-laptop-odoo-record', class: 'odoo-record-laptop-col' },
        // Non-Laptop-specific columns
        { id: 'toggle-nonlaptop-rec-date', class: 'rec-date-nonlaptop-col' },
        { id: 'toggle-nonlaptop-tracking', class: 'tracking-nonlaptop-col' },
        { id: 'toggle-nonlaptop-name', class: 'name-nonlaptop-col' },
        { id: 'toggle-nonlaptop-location', class: 'location-nonlaptop-col' },
        { id: 'toggle-nonlaptop-category', class: 'category-nonlaptop-col' },
        { id: 'toggle-nonlaptop-inspectReq', class: 'inspectReq-nonlaptop-col' },
        { id: 'toggle-nonlaptop-condition', class: 'condition-nonlaptop-col' },
        // test
        { id: 'toggle-laptop-checking', class: 'checking-laptop-col' },
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
            toggleColumn(checkbox, column.class);
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

        selectBar.addEventListener('click', () => {
            dropdownMenu.classList.toggle('active');
        });

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
                        } else if (hiddenInput.name === 'inspection_request') {
                            switch (item) {
                                case 'As it': className = 'condition-n'; break;
                                case 'Quick Check': className = 'condition-b'; break;
                                case 'Full inspection': className = 'condition-red'; break;
                            }
                        }
                        return `<span class="selected-item ${className}">${item}</span>`;
                    }).join(' ') 
                    : selectBar.textContent;

                hiddenInput.value = selectedItems.join(',');
            });
        });

        document.addEventListener('click', (e) => {
            if (!selectBar.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('active');
            }
        });
    });
});

function callRoute(route) {
    fetch(route)
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }

            // Get the file name from headers
            const disposition = response.headers.get('Content-Disposition');
            let filename = "report";

            if (disposition && disposition.includes("filename=")) {
                const matches = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (matches && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            return response.blob().then(blob => ({ blob, filename }));
        })
        .then(({ blob, filename }) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error:', error);
        });
}


// Make it globally available for inline onclick use
window.callRoute = callRoute;
