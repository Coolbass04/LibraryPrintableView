// multnomahPrintableView.js

// This script will iterate through the HTML page of the Multnomah library and perform similar functions as clackamasPrintableView.js.

// Example function to fetch and iterate through the HTML page
async function fetchMultnomahLibraryData() {
    try {
        const response = await fetch('https://multcolib.bibliocommons.com/v2/checkedout');
        const html = await response.text();
        // Process the HTML content here
        console.log(html);
    } catch (error) {
        console.error('Error fetching Multnomah library data:', error);
    }
}

fetchMultnomahLibraryData();
