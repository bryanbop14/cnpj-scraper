
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const urlBase = 'https://cnpj.biz/procura/guindaste';
  let resultados = [];

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const extrairDadosDaEmpresa = async (url, browser) => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const dados = await page.evaluate(() => {
      const getTextFromLabel = (labelText) => {
        const label = [...document.querySelectorAll("p")]
          .find(p => p.innerText.trim().startsWith(labelText));
        return label ? label.querySelector("b")?.innerText.trim() || '' : '';
      };

      const getMultiplePhones = () => {
        const telSection = [...document.querySelectorAll("h2")]
          .find(h => h.innerText.trim().includes("Contatos"))?.nextElementSibling;
        if (!telSection) return '';
        return [...telSection.parentElement.querySelectorAll('b')]
          .map(b => b.innerText.trim())
          .filter(t => /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(t) || t.includes('('))
          .join(' | ');
      };

      return {
        "Situação": getTextFromLabel("Situação:"),
        "CNPJ": getTextFromLabel("CNPJ:"),
        "Razão Social": getTextFromLabel("Razão Social:"),
        "Nome Fantasia": getTextFromLabel("Nome Fantasia:"),
        "E-mail": getTextFromLabel("E-mail:"),
        "Telefone(s)": getMultiplePhones(),
        "Logradouro": getTextFromLabel("Logradouro:"),
        "Bairro": getTextFromLabel("Bairro:"),
        "CEP": getTextFromLabel("CEP:"),
        "Município": getTextFromLabel("Município:"),
        "Estado": getTextFromLabel("Estado:")
      };
    });

    await page.close();
    return dados;
  };

  await page.goto(urlBase, { waitUntil: 'domcontentloaded' });

  while (true) {
    const links = await page.evaluate(() => {
      return [...document.querySelectorAll('li > a')]
        .filter(el => el.closest('li')?.innerText.includes("ATIVA"))
        .map(el => el.href);
    });

    for (const link of links) {
      console.log("Processando:", link);
      const dados = await extrairDadosDaEmpresa(link, browser);
      resultados.push(dados);
      await delay(1000);
    }

    const temProxima = await page.$x("//a[contains(text(),'Próxima Página') and not(contains(@class,'pointer-events-none'))]");
    if (temProxima.length) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        temProxima[0].click()
      ]);
    } else {
      break;
    }
  }

  const csvHeaders = Object.keys(resultados[0]);
  const csvContent = [
    csvHeaders.join(","),
    ...resultados.map(row => csvHeaders.map(h => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  const filePath = path.join(__dirname, "empresas_cnpj_guindaste.csv");
  fs.writeFileSync(filePath, csvContent);
  console.log("✅ CSV salvo em:", filePath);

  await browser.close();
})();
