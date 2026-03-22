const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    console.log("Lancement de Puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const baseUrl = 'https://blolab.bj';
    console.log(`Navigation vers ${baseUrl}...`);
    
    try {
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        console.log("Extraction des liens présents sur la page d'accueil...");
        const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            return anchors.map(a => a.href);
        });
        
        // Nettoyer et filtrer les liens pour ne garder que ceux du domaine blolab.bj
        const uniqueLinks = [...new Set(links)]
            .filter(link => link && link.startsWith(baseUrl))
            .map(link => link.split('#')[0]) // Enlever les ancres
            .filter(link => link !== baseUrl && link !== baseUrl + '/'); // Exclure la racine si on veut juste les sous-pages

        const finalLinks = [...new Set(uniqueLinks)];
        // Ajouter la racine si on la veut explicitement
        finalLinks.unshift(baseUrl);

        console.log(`${finalLinks.length} liens internes uniques trouvés.`);
        
        fs.writeFileSync('blolab_links.json', JSON.stringify(finalLinks, null, 2));
        console.log("✅ Liens sauvegardés dans d:\\WhatsApp CRM\\app\\blolab_links.json");
    } catch (e) {
        console.error("Erreur lors du scraping :", e);
    } finally {
        await browser.close();
    }
})();
