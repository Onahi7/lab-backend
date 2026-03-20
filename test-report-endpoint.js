const orderId = '69bc62925c0bf31f9f15bc01'; // Ibrahim Koroma - Immunoassay
const apiUrl = `http://localhost:3000/api/reports/lab-results/${orderId}`;

console.log(`Testing API endpoint: ${apiUrl}\n`);

fetch(apiUrl)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('✅ API Response received\n');
    console.log('Data structure:');
    console.log('  - Patient:', data.patientInfo?.fullName);
    console.log('  - Order:', data.orderInfo?.orderNumber);
    console.log('  - Categories:', data.resultsByCategory?.length);
    
    if (data.resultsByCategory) {
      data.resultsByCategory.forEach(cat => {
        console.log(`\n  📁 ${cat.categoryDisplayName}: ${cat.results.length} tests`);
        cat.results.slice(0, 3).forEach(r => {
          console.log(`     • ${r.testName}: ${r.value} ${r.unit || ''}`);
        });
      });
    }
  })
  .catch(error => {
    console.error('❌ API Error:', error.message);
    console.error('\nIs the backend server running on port 3000?');
    console.error('Start it with: npm run dev (in backend folder)');
  });
