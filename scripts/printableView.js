// ==UserScript==
// @name         Library Checkout Printable View
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Create a printable view of library checkout books (Clackamas + WCCLS)
// @author       You
// @match        https://lincc.ent.sirsi.net/client/en_US/lincc/search/account*
// @match        https://wccls.bibliocommons.com/v2/checkedout*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ---------- Adapters: per-library extraction + button mounting ----------
    const ADAPTERS = [
        {
            name: 'Clackamas (SirsiDynix Enterprise)',
            matches: (url) => url.includes('lincc.ent.sirsi.net'),
            waitSelector: 'table.checkoutsList',
            extractBooks: () => {
                const books = [];
                const rows = document.querySelectorAll('table.checkoutsList tbody tr.checkoutsLine');
                rows.forEach(row => {
                    const titleLink = row.querySelector('.checkoutsBookInfo a');
                    const authorEl = row.querySelector('.checkouts_author');
                    const coverEl = row.querySelector('.myAccountCoverArt img');
                    const dueEl = row.querySelector('.checkoutsDueDate');
                    const callEl = row.querySelector('.checkouts_callNumber');

                    if (!titleLink) return;
                    books.push({
                        title: titleLink.textContent.trim(),
                        author: authorEl ? authorEl.textContent.trim() : '',
                        coverUrl: coverEl ? coverEl.src : '',
                        coverAlt: coverEl ? coverEl.alt : '',
                        dueDate: dueEl ? dueEl.textContent.trim() : '',
                        callNumber: callEl ? callEl.textContent.trim() : ''
                    });
                });
                return books;
            },
            mountButtons: (onClick) => {
                const areas = document.querySelectorAll('.checkoutsButtons');
                areas.forEach((area, idx) => {
                    const id = idx === 0 ? 'printable-view-btn' : 'printable-view-btn-bottom';
                    if (document.getElementById(id)) return;
                    const btn = document.createElement('input');
                    btn.type = 'button';
                    btn.value = 'Printable View';
                    btn.className = 'button';
                    btn.id = id;
                    btn.style.marginLeft = '10px';
                    btn.title = 'Create a printable view of your checked out books';
                    btn.addEventListener('click', onClick);
                    area.appendChild(btn);
                });
            }
        },

        {
            name: 'WCCLS (BiblioCommons)',
            matches: (url) => url.includes('wccls.bibliocommons.com'),
            waitSelector: '.cp-checked-out-list',
            extractBooks: async () => {
                const parseItems = (root) => {
                    const books = [];
                    const items = root.querySelectorAll('.cp-checked-out-item');
                    items.forEach(item => {
                        const titleEl = item.querySelector('.cp-title .title-content');
                        const subtitleEl = item.querySelector('.cp-title .cp-subtitle');
                        const authorEl = item.querySelector('.cp-by-author-block .author-link');
                        const coverEl = item.querySelector('.jacket-cover-container img.cp-jacket-cover');
                        const dueEl = item.querySelector('.cp-checked-out-due-on .cp-short-formatted-date');

                        let callNumber = '';
                        item.querySelectorAll('.cp-item-field').forEach(field => {
                            const name = field.querySelector('.field-name');
                            const val = field.querySelector('.field-value');
                            if (name && val && /call number/i.test(name.textContent)) {
                                callNumber = val.textContent.trim();
                            }
                        });

                        if (!titleEl) return;
                        let title = titleEl.textContent.trim();
                        if (subtitleEl) title += ': ' + subtitleEl.textContent.trim();

                        // getAttribute() returns the raw attribute; img.src would
                        // resolve relative to the parsed document's (empty) base URL.
                        const coverUrl = coverEl
                            ? (coverEl.getAttribute('src') || coverEl.getAttribute('data-src') || '')
                            : '';

                        books.push({
                            title,
                            author: authorEl ? authorEl.textContent.trim() : '',
                            coverUrl,
                            coverAlt: coverEl ? (coverEl.getAttribute('alt') || title) : title,
                            dueDate: dueEl ? dueEl.textContent.trim() : '',
                            callNumber
                        });
                    });
                    return books;
                };

                const allBooks = parseItems(document);

                // BiblioCommons paginates (25/page). Fetch remaining pages so we
                // print the full checked-out list, not just what's visible.
                const extraPages = new Set();
                document.querySelectorAll('.cp-pagination a.pagination-item__link[data-page]').forEach(a => {
                    const n = parseInt(a.dataset.page, 10);
                    if (n && n > 1) extraPages.add(n);
                });

                // BiblioCommons renders cover <img> tags client-side after
                // page load, so a raw fetch + DOMParser sees only placeholders.
                // Load each extra page in a hidden iframe and let the SPA
                // populate images before we read the DOM.
                const loadPageInIframe = (pageUrl) => new Promise((resolve) => {
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.left = '-9999px';
                    iframe.style.top = '0';
                    iframe.style.width = '1200px';
                    iframe.style.height = '800px';
                    iframe.style.border = '0';
                    iframe.src = pageUrl;

                    let settled = false;
                    const finish = (doc) => {
                        if (settled) return;
                        settled = true;
                        resolve(doc);
                        setTimeout(() => iframe.remove(), 0);
                    };

                    // Poll the iframe DOM until real cover <img> elements appear
                    // (or we give up). Placeholders render a <div class="cp-jacket-cover">;
                    // the real cover is <img class="cp-jacket-cover">.
                    iframe.addEventListener('load', () => {
                        const doc = iframe.contentDocument;
                        const deadline = Date.now() + 10000;
                        const check = () => {
                            if (!doc) return finish(null);
                            const items = doc.querySelectorAll('.cp-checked-out-item');
                            if (items.length) {
                                const imgCount = doc.querySelectorAll('.cp-checked-out-item img.cp-jacket-cover').length;
                                if (imgCount >= items.length || Date.now() > deadline) {
                                    return finish(doc);
                                }
                            } else if (Date.now() > deadline) {
                                return finish(doc);
                            }
                            setTimeout(check, 250);
                        };
                        check();
                    });

                    document.body.appendChild(iframe);
                    setTimeout(() => finish(iframe.contentDocument || null), 15000);
                });

                for (const page of [...extraPages].sort((a, b) => a - b)) {
                    try {
                        const url = new URL(window.location.href);
                        url.searchParams.set('page', page);
                        const doc = await loadPageInIframe(url.toString());
                        if (!doc) continue;
                        allBooks.push(...parseItems(doc));
                    } catch (err) {
                        console.error('Failed to load page', page, err);
                    }
                }

                return allBooks;
            },
            mountButtons: (onClick) => {
                if (document.getElementById('printable-view-btn')) return;
                const printBtn = document.querySelector('.cp-print-button');
                if (!printBtn) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'printable-view-btn';
                btn.className = 'cp-btn btn cp-default-btn btn-default btn-flat';
                btn.style.marginLeft = '8px';
                btn.textContent = 'Printable View';
                btn.title = 'Create a printable view of your checked out books';
                btn.addEventListener('click', onClick);
                printBtn.parentNode.insertBefore(btn, printBtn.nextSibling);
            }
        }
    ];

    // ---------- Shared printable-page renderer ----------
    function createPrintablePage(books) {
        const totalBooks = books.length;
        const booksPerPage = Math.ceil(totalBooks / 2); // always split into 2 pages

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

            .book-title, .book-author, .book-details, .due-date { display: none; }
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

        .print-button:hover { background: #45a049; }

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

        .clear-all-btn { background: #ff6b6b; color: white; }
        .clear-all-btn:hover { background: #ff5252; }
        .check-all-btn { background: #4CAF50; color: white; }
        .check-all-btn:hover { background: #45a049; }
    </style>
    <script>
        function toggleBook(checkbox, bookId) {
            const bookItem = document.getElementById('book-' + bookId);
            if (checkbox.checked) bookItem.classList.add('checked');
            else bookItem.classList.remove('checked');
        }
        function checkAllBooks() {
            document.querySelectorAll('.book-checkbox').forEach((cb, i) => {
                cb.checked = true;
                document.querySelectorAll('.book-item')[i].classList.add('checked');
            });
        }
        function clearAllBooks() {
            document.querySelectorAll('.book-checkbox').forEach((cb, i) => {
                cb.checked = false;
                document.querySelectorAll('.book-item')[i].classList.remove('checked');
            });
        }
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

        const totalPages = 2;
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const startIndex = pageIndex * booksPerPage;
            const endIndex = Math.min(startIndex + booksPerPage, totalBooks);
            const pageBooks = books.slice(startIndex, endIndex);

            if (pageIndex === 1) htmlContent += '<div class="page-break"></div>';
            htmlContent += `\n    <div class="books-grid">\n`;

            pageBooks.forEach((book, index) => {
                const bookId = startIndex + index;
                const coverElement = book.coverUrl
                    ? `<img src="${book.coverUrl}" alt="${book.coverAlt}" class="book-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div class="book-cover-placeholder" style="display:none;">${book.title}</div>`
                    : `<div class="book-cover-placeholder">${book.title}</div>`;

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
        printWindow.focus();
    }

    // ---------- Init ----------
    function waitForElement(selector, callback, timeout = 30000) {
        const existing = document.querySelector(selector);
        if (existing) { callback(existing); return; }
        const start = Date.now();
        const id = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) { clearInterval(id); callback(el); }
            else if (Date.now() - start > timeout) clearInterval(id);
        }, 500);
    }

    function init() {
        const adapter = ADAPTERS.find(a => a.matches(window.location.href));
        if (!adapter) return;

        waitForElement(adapter.waitSelector, () => {
            const onClick = async () => {
                let books;
                try {
                    books = await adapter.extractBooks();
                } catch (err) {
                    console.error(err);
                    alert('Failed to extract books: ' + err.message);
                    return;
                }
                if (!books.length) {
                    alert('No books found to create printable view.');
                    return;
                }
                createPrintablePage(books);
            };

            adapter.mountButtons(onClick);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-run on SPA navigation or when the list re-renders without the button.
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(init, 1000);
            return;
        }
        const adapter = ADAPTERS.find(a => a.matches(window.location.href));
        if (adapter
            && document.querySelector(adapter.waitSelector)
            && !document.getElementById('printable-view-btn')) {
            init();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
