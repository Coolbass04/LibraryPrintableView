// ==UserScript==
// @name         Library Checkout Printable View
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Create a printable view of library checkout books
// @author       You
// @match        https://lincc.ent.sirsi.net/client/en_US/lincc/search/account*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Wait for the page to load completely
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
        } else {
            setTimeout(() => waitForElement(selector, callback), 500);
        }
    }

    // Function to extract book data from the checkout table
    function extractBookData() {
        const books = [];
        const checkoutRows = document.querySelectorAll('table.checkoutsList tbody tr.checkoutsLine');

        checkoutRows.forEach(row => {
            const titleLink = row.querySelector('.checkoutsBookInfo a');
            const authorElement = row.querySelector('.checkouts_author');
            const coverImage = row.querySelector('.myAccountCoverArt img');
            const dueDateElement = row.querySelector('.checkoutsDueDate');
            const callNumberElement = row.querySelector('.checkouts_callNumber');

            if (titleLink) {
                const book = {
                    title: titleLink.textContent.trim(),
                    author: authorElement ? authorElement.textContent.trim() : '',
                    coverUrl: coverImage ? coverImage.src : '',
                    coverAlt: coverImage ? coverImage.alt : '',
                    dueDate: dueDateElement ? dueDateElement.textContent.trim() : '',
                    callNumber: callNumberElement ? callNumberElement.textContent.trim() : ''
                };
                books.push(book);
            }
        });

        return books;
    }

    // Function to get total book count
    function getTotalBookCount() {
        const summaryElement = document.querySelector('#checkoutsSummary h3 div');
        if (summaryElement) {
            const match = summaryElement.textContent.match(/Total Items Checked Out: (\d+)/);
            return match ? parseInt(match[1]) : 0;
        }
        return 0;
    }

    // Function to calculate books per page - 3 columns, aim for 18 per page
    function calculateBooksPerPage(totalBooks) {
        return Math.ceil(totalBooks / 2); // Always split into 2 pages
    }

    // Function to create the printable page
    function createPrintablePage(books) {
        const totalBooks = books.length;
        const booksPerPage = calculateBooksPerPage(totalBooks);

        // Create the printable window
        const printWindow = window.open('', '_blank');

        const printHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Library Books to Return</title>
    <style>
        @media print {
            @page {
                size: A4 landscape;
                margin: 10mm;
            }

            body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                font-size: 11px;
                line-height: 1.3;
            }

            .page-break {
                page-break-before: always;
            }

            .no-print {
                display: none;
            }

            .books-grid {
                display: grid !important;
                grid-template-columns: repeat(6, 1fr) !important;
                gap: 12px 10px !important;
                margin: 10px 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                overflow: visible !important;
            }

            .book-item {
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 10px;
                background: white;
                text-align: center;
                page-break-inside: avoid;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 220px;
                max-height: 220px;
                max-width: 100%;
                box-sizing: border-box;
                min-width: 0;
                position: relative;
                overflow: visible;
            }

            /* DEBUG: Number each book item */
            .book-item::before {
                content: counter(book-counter);
                counter-increment: book-counter;
                position: absolute;
                top: 6px;
                left: 6px;
                background: #222;
                color: #fff;
                padding: 2px 6px;
                border-radius: 9px;
                font-size: 11px;
                line-height: 1;
                z-index: 2;
            }

            .books-grid {
                counter-reset: book-counter;
            }

            .book-checkbox-container {
                position: absolute;
                top: 6px;
                right: 6px;
                margin: 0;
                padding: 0;
                z-index: 2;
            }

            .book-checkbox {
                width: 14px;
                height: 14px;
                border: 1px solid #333;
                margin: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .book-cover {
                width: 100%;
                height: auto;
                max-width: 180px;
                max-height: 200px;
                aspect-ratio: 7 / 9;
                object-fit: contain;
                border: 1px solid #ccc;
                flex-shrink: 0;
            }

            .book-cover-placeholder {
                width: 100%;
                height: auto;
                max-width: 180px;
                max-height: 200px;
                aspect-ratio: 7 / 9;
                border: 1px solid #ccc;
                background: #f5f5f5;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                font-size: 12px;
                padding: 4px;
                box-sizing: border-box;
                flex-shrink: 0;
            }

            .book-title {
                display: none;
            }

            .book-author {
                display: none;
            }

            .book-details {
                display: none;
            }

            .due-date {
                display: none;
            }
        }

        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: white;
        }



        .books-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .book-item {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            background: #fafafa;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: relative;
        }

        .book-checkbox-container {
            text-align: right;
            margin-bottom: 10px;
        }

        .book-checkbox {
            width: 20px;
            height: 20px;
            cursor: pointer;
            margin: 0;
        }

        .book-item.checked {
            background: #e8f5e8;
            border-color: #4CAF50;
            opacity: 0.7;
        }

        .book-item.checked .book-title {
            text-decoration: line-through;
            color: #666;
        }

        .book-cover {
            max-width: 120px;
            max-height: 160px;
            margin: 0 auto 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: block;
        }

        .book-cover-placeholder {
            width: 120px;
            height: 160px;
            background: #e0e0e0;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 10px;
            font-size: 12px;
            color: #666;
            text-align: center;
            padding: 10px;
            box-sizing: border-box;
        }

        .book-title {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 5px;
            color: #333;
            line-height: 1.3;
        }

        .book-author {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }

        .book-details {
            font-size: 11px;
            color: #888;
            margin-top: 10px;
        }

        .due-date {
            color: #d32f2f;
            font-weight: bold;
        }

        .print-button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 20px 0;
        }

        .print-button:hover {
            background: #45a049;
        }



        .controls {
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            background: #f0f0f0;
            border-radius: 8px;
            border: 1px solid #ccc;
        }

        .controls button {
            margin: 0 10px;
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }

        .clear-all-btn {
            background: #ff6b6b;
            color: white;
        }

        .clear-all-btn:hover {
            background: #ff5252;
        }

        .check-all-btn {
            background: #4CAF50;
            color: white;
        }

        .check-all-btn:hover {
            background: #45a049;
        }
    </style>
    <script>
        function toggleBook(checkbox, bookId) {
            const bookItem = document.getElementById('book-' + bookId);
            if (checkbox.checked) {
                bookItem.classList.add('checked');
            } else {
                bookItem.classList.remove('checked');
            }
        }

        function checkAllBooks() {
            const checkboxes = document.querySelectorAll('.book-checkbox');
            const bookItems = document.querySelectorAll('.book-item');
            checkboxes.forEach((cb, index) => {
                cb.checked = true;
                bookItems[index].classList.add('checked');
            });
        }

        function clearAllBooks() {
            const checkboxes = document.querySelectorAll('.book-checkbox');
            const bookItems = document.querySelectorAll('.book-item');
            checkboxes.forEach((cb, index) => {
                cb.checked = false;
                bookItems[index].classList.remove('checked');
            });
        }

        function debugGrid() {
            const grid = document.querySelector('.books-grid');
            if (grid) {
                const computedStyle = window.getComputedStyle(grid);
                console.log('=== GRID DEBUG ===');
                console.log('Grid template columns:', computedStyle.gridTemplateColumns);
                console.log('Grid template rows:', computedStyle.gridTemplateRows);
                console.log('Grid width:', computedStyle.width);
                console.log('Grid display:', computedStyle.display);
                console.log('Container width:', grid.offsetWidth);
                console.log('Container parent width:', grid.parentElement.offsetWidth);
                console.log('Number of book items:', grid.children.length);

                // Count actual columns
                const columnValues = computedStyle.gridTemplateColumns.split(' ');
                console.log('Actual number of columns detected:', columnValues.length);
                console.log('CSS rule that should be applied: 1fr 1fr 1fr 1fr 1fr 1fr');
                console.log('What browser computed instead:', computedStyle.gridTemplateColumns);

                // Check for conflicting styles
                const allRules = Array.from(document.styleSheets).flatMap(sheet => {
                    try {
                        return Array.from(sheet.cssRules || sheet.rules || []);
                    } catch (e) {
                        return [];
                    }
                }).filter(rule => rule.selectorText && rule.selectorText.includes('.books-grid'));

                console.log('All CSS rules affecting .books-grid:', allRules.map(rule => ({
                    selector: rule.selectorText,
                    gridTemplateColumns: rule.style.gridTemplateColumns
                })));

                // Check each book item
                const bookItems = grid.querySelectorAll('.book-item');
                bookItems.forEach((item, index) => {
                    if (index < 10) { // Only log first 10 to avoid spam
                        console.log(\`Book \${index + 1} width: \${item.offsetWidth}px\`);
                    }
                });

                // Add visual debugging
                grid.style.border = '5px solid red';
                grid.style.position = 'relative';

                // Add grid column indicators
                for (let i = 1; i <= 6; i++) {
                    const indicator = document.createElement('div');
                    indicator.textContent = \`Col \${i}\`;
                    indicator.style.position = 'absolute';
                    indicator.style.top = '-30px';
                    indicator.style.left = \`\${(i-1) * (100/6)}%\`;
                    indicator.style.background = 'yellow';
                    indicator.style.padding = '2px';
                    indicator.style.fontSize = '12px';
                    indicator.style.zIndex = '1000';
                    grid.appendChild(indicator);
                }
            }
        }

        // Page load handler with debugging
        window.onload = function() {
            // Page loaded
        };
    </script>
</head>
<body>
    <div class="no-print">
        <button class="print-button" onclick="window.print()">🖨️ Print This Page</button>
        <div class="controls">
            <button class="check-all-btn" onclick="checkAllBooks()">✓ Check All</button>
            <button class="clear-all-btn" onclick="clearAllBooks()">✗ Clear All</button>
        </div>
    </div>
`;

        let htmlContent = printHTML;

        // Debug: Add console log to see what we're working with
        console.log(`Total books: ${totalBooks}, Books per page: ${booksPerPage}`);

        // Split books into pages - ensure exactly 2 pages
        const totalPages = 2;
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const startIndex = pageIndex * booksPerPage;
            const endIndex = Math.min(startIndex + booksPerPage, totalBooks);
            const pageBooks = books.slice(startIndex, endIndex);

            console.log(`Page ${pageIndex + 1}: ${pageBooks.length} books (${startIndex + 1}-${endIndex})`);

            // Only add page break for the second page
            if (pageIndex === 1) {
                htmlContent += '<div class="page-break"></div>';
            }

            htmlContent += `
    <div class="books-grid">
`;

            pageBooks.forEach((book, index) => {
                const bookId = startIndex + index;
                const coverElement = book.coverUrl && book.coverUrl !== '' ?
                    `<img src="${book.coverUrl}" alt="${book.coverAlt}" class="book-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                     <div class="book-cover-placeholder" style="display:none;">${book.title}</div>` :
                    `<div class="book-cover-placeholder">${book.title}</div>`;

                htmlContent += `
        <div class="book-item" id="book-${bookId}">
            <div class="book-checkbox-container">
                <input type="checkbox" class="book-checkbox" onchange="toggleBook(this, ${bookId})">
            </div>
            ${coverElement}
        </div>
`;
            });

            htmlContent += '</div>';

            // Stop if we've processed all books
            if (endIndex >= totalBooks) break;
        }

        htmlContent += `
    <div class="no-print">
        <div class="controls">
            <button class="check-all-btn" onclick="checkAllBooks()">✓ Check All</button>
            <button class="clear-all-btn" onclick="clearAllBooks()">✗ Clear All</button>
        </div>
        <button class="print-button" onclick="window.print()">🖨️ Print This Page</button>
    </div>
</body>
</html>
`;

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Focus the print window
        printWindow.focus();
    }

    // Function to add the printable view button
    function addPrintableButton() {
        // Find the renew button area
        const renewButtonArea = document.querySelector('.checkoutsButtons');
        if (!renewButtonArea) return;

        // Check if button already exists
        if (document.querySelector('#printable-view-btn')) return;

        // Create the printable view button
        const printButton = document.createElement('input');
        printButton.type = 'button';
        printButton.value = 'Printable View';
        printButton.className = 'button';
        printButton.id = 'printable-view-btn';
        printButton.style.marginLeft = '10px';
        printButton.title = 'Create a printable view of your checked out books';

        // Add click event
        printButton.addEventListener('click', function() {
            const books = extractBookData();
            console.log(`Extracted ${books.length} books from the page`);
            if (books.length === 0) {
                alert('No books found to create printable view.');
                return;
            }
            createPrintablePage(books);
        });

        // Add the button next to the renew button
        renewButtonArea.appendChild(printButton);
    }

    // Initialize the script
    function init() {
        // Check if we're on the account page with checkouts
        if (window.location.href.includes('account')) {
            // Wait for the checkout table to load
            waitForElement('table.checkoutsList', function() {
                addPrintableButton();

                // Also add to the bottom button area if it exists
                const bottomButtonArea = document.querySelectorAll('.checkoutsButtons')[1];
                if (bottomButtonArea && !bottomButtonArea.querySelector('#printable-view-btn-bottom')) {
                    const bottomButton = document.createElement('input');
                    bottomButton.type = 'button';
                    bottomButton.value = 'Printable View';
                    bottomButton.className = 'button';
                    bottomButton.id = 'printable-view-btn-bottom';
                    bottomButton.style.marginLeft = '10px';
                    bottomButton.title = 'Create a printable view of your checked out books';

                    bottomButton.addEventListener('click', function() {
                        const books = extractBookData();
                        if (books.length === 0) {
                            alert('No books found to create printable view.');
                            return;
                        }
                        createPrintablePage(books);
                    });

                    bottomButtonArea.appendChild(bottomButton);
                }
            });
        }
    }

    // Run when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also run when the URL changes (for single-page apps)
    let currentUrl = window.location.href;
    const observer = new MutationObserver(function() {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(init, 1000); // Delay to let content load
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();