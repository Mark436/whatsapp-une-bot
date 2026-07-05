const { chromium } = require('playwright');
const {InputError}=require('../parts/errores.js')

async function obtenerRutas(evaluating) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Ir a la página web
    await page.goto('https://unesonora.com/');
    
    // Obtener todos los elementos <li> dentro del <ul>
    const listItems = await page.$$('ul.mapRoutesSidebar_body-list__1sd3l > li');
    let rutas='';
    // Recorrer cada elemento <li> para obtener el texto del botón
    for (const li in listItems) {
      const buttonText = await listItems[li].$eval('button', (button) => button.textContent)
      if(buttonText.toLowerCase()==evaluating.toLowerCase())return buttonText
      rutas+=buttonText+"\n"
      if(li==listItems.length-1)return rutas
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}
async function watchRoute(ruta,path="./camiones/") {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const fileName=ruta+".jpg"
  const rout=`${path}${ruta}.jpg`;
  try {
    await page.goto("https://unesonora.com/");
    await page.getByRole("button",{name:"He leído y acepto el Aviso de Privacidad"}).click()
    await page.waitForSelector(".btn-selectroute")
    await page.click(".btn-selectroute")
    await page.waitForSelector(".mapRoutesSidebar_body-list__1sd3l")
    await page.getByRole("button",{name:`Línea ${ruta}`}).click()
    await page.waitForSelector(".busMarker")
    await page.screenshot({ path:rout });
    return fileName
  } catch (error) {
    if(error.message.startsWith("locator.click")){
      const errorResult=await obtenerRutas(ruta);
      if(errorResult?.toLowerCase()==ruta.toLowerCase()){
        browser.close()
        return watchRoute(errorResult,path)
      }
      throw new InputError("No definiste bien el nombre de la ruta",{visible:true,return:errorResult})
    }
    throw error
  } finally {
    await browser.close();
  }
}
module.exports={watchRoute}