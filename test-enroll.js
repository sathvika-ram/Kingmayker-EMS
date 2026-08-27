async function test() {
    try {
        const res = await fetch('http://localhost:5000/api/voters/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinator_id: "4", // Test as string
                voter_name: 'Test Voter',
                father_name: 'Test Father',
                date_of_birth: '1990-01-01',
                mobile_number: '1234567890',
                citizenship_status: true,
                constituency: 'Warangal',
                mandal: 'Test Mandal',
                village: 'Test Village',
                degree_qualification: 'BTech',
                graduation_year: "2012",
                degree_certificate_url: 'http://test.com/cert.pdf'
            })
        });
        const data = await res.json();
        console.log(res.status, data);
    } catch (err) {
        console.error("Error:", err);
    }
}
test();
