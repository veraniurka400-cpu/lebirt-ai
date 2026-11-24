const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "lebirt_ai_settings_v1";
const defaults = { provider:"openai", endpoint:"https://api.openai.com/v1", apiKey:"", model:"" };
let settings = {...defaults};
let selectedImage = null;
let busy = false;

const providerDefaults = {
  openai: {endpoint:"https://api.openai.com/v1", model:"gpt-4o-mini"},
  openrouter: {endpoint:"https://openrouter.ai/api/v1", model:"openai/gpt-4o-mini"},
  gemini: {endpoint:"https://generativelanguage.googleapis.com/v1beta/openai", model:"gemini-2.0-flash"},
  custom: {endpoint:"", model:""}
};

function loadSettings(){
  try { settings = {...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")}; }
  catch { settings = {...defaults}; }
  $("provider").value = settings.provider;
  $("endpoint").value = settings.endpoint;
  $("apiKey").value = settings.apiKey;
  $("model").value = settings.model;
  updateProviderHint();
}
function saveSettings(){
  settings = {
    provider:$("provider").value,
    endpoint:$("endpoint").value.trim().replace(/\/+$/,""),
    apiKey:$("apiKey").value.trim(),
    model:$("model").value.trim()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    $("settingsStatus").textContent = "Configuración guardada en este navegador.";
  } catch {
    $("settingsStatus").textContent = "No se pudo guardar. Revisa la configuración de almacenamiento del navegador.";
  }
}
function updateProviderHint(){
  const p = $("provider").value;
  $("endpoint").value = providerDefaults[p].endpoint;
  $("model").value = providerDefaults[p].model;
  $("modelHint").textContent = p === "gemini"
    ? "Se usa el endpoint compatible con OpenAI de Gemini. Escribe un modelo disponible en tu cuenta."
    : "Puedes escribir el identificador exacto del modelo de tu proveedor.";
}
function openSettings(){ $("settingsModal").classList.add("open"); $("settingsModal").setAttribute("aria-hidden","false"); }
function closeSettings(){ $("settingsModal").classList.remove("open"); $("settingsModal").setAttribute("aria-hidden","true"); }
function showChat(){ $("welcome").style.display="none"; $("chat").style.display="flex"; }
function addMessage(role,text,imageUrl){
  const row=document.createElement("div"); row.className=`message ${role}`;
  if(role==="assistant"){const av=document.createElement("div");av.className="mini-avatar";av.textContent="L";row.append(av);}
  const bubble=document.createElement("div");bubble.className="bubble";bubble.textContent=text;
  if(imageUrl){const img=document.createElement("img");img.src=imageUrl;img.alt="Imagen adjunta";bubble.append(document.createElement("br"),img);}
  row.append(bubble);$("chat").append(row);row.scrollIntoView({behavior:"smooth",block:"end"});
  return bubble;
}
function setBusy(value){busy=value;$("sendButton").disabled=value;$("sendButton").textContent=value?"…":"↑";}
function resizePrompt(){$("prompt").style.height="auto";$("prompt").style.height=Math.min($("prompt").scrollHeight,150)+"px";}
function dataUrlToBase64(dataUrl){return dataUrl.split(",")[1] || "";}
async function loadModels(){
  saveSettings();
  if(!settings.apiKey){$("settingsStatus").textContent="Primero introduce tu API Key.";return;}
  if(settings.provider==="gemini"){ $("settingsStatus").textContent="Escribe un ID de modelo Gemini compatible en el campo Modelo."; return; }
  try{
    const res=await fetch(settings.endpoint+"/models",{headers:{Authorization:"Bearer "+settings.apiKey}});
    if(!res.ok) throw new Error("El proveedor no permitió consultar modelos ("+res.status+").");
    const data=await res.json();
    const models=(data.data||data.models||[]).map(x=>x.id||x.name).filter(Boolean);
    $("modelOptions").innerHTML="";
    models.forEach(name=>{const opt=document.createElement("option");opt.value=name;$("modelOptions").append(opt);});
    $("settingsStatus").textContent=models.length?`Se encontraron ${models.length} modelos.`:"No se encontraron modelos. Puedes escribir el ID manualmente.";
  }catch(err){$("settingsStatus").textContent=err.message+" También puedes escribir el modelo manualmente.";}
}
async function callOpenAICompatible(messages){
  const body={model:settings.model,messages,temperature:0.4};
  const res=await fetch(settings.endpoint+"/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+settings.apiKey},
    body:JSON.stringify(body)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error?.message || data.message || `Error de API: ${res.status}`);
  return data.choices?.[0]?.message?.content || "La API respondió, pero no devolvió texto.";
}
async function callGemini(messages){
  const endpoint=settings.endpoint+"/chat/completions";
  return callOpenAICompatible(messages); // Gemini OpenAI-compatible endpoint
}
async function sendPrompt(prompt){
  if(busy)return;
  if(!settings.apiKey || !settings.endpoint || !settings.model){
    addMessage("assistant","Antes de empezar, abre Configuración y añade tu API Key, proveedor y modelo. La clave es necesaria para conectar la IA.");
    openSettings();return;
  }
  showChat();
  let imageUrl=null;
  if(selectedImage){imageUrl=URL.createObjectURL(selectedImage);}
  addMessage("user",prompt,imageUrl);
  const thinking=addMessage("assistant","LEBIRT AI está preparando tu respuesta…");
  setBusy(true);
  const system = `Eres LEBIRT AI, un asistente experto en desarrollo de Roblox Studio y Luau. Responde en español claro. Ayuda a diseñar sistemas, Scripts, LocalScripts, ModuleScripts y GUIs. Cuando generes código, indica exactamente dónde colocar cada script, qué objetos/RemoteEvents crear y entrega código completo. Prioriza seguridad del servidor: valida las acciones en el servidor y nunca confíes en el cliente. No afirmes que puedes editar Studio Lite directamente; entrega instrucciones y código que el usuario pueda colocar. Si falta información esencial, pregunta solo lo necesario.`;
  try{
    let userContent=prompt;
    if(selectedImage){
      userContent += "\n\nEl usuario adjuntó una imagen. En esta primera versión, la imagen se adjunta a la conversación visualmente, pero el envío de imágenes a la API todavía no está implementado. Pide una descripción si es necesaria.";
    }
    const answer = settings.provider==="gemini"
      ? await callGemini([{role:"system",content:system},{role:"user",content:userContent}])
      : await callOpenAICompatible([{role:"system",content:system},{role:"user",content:userContent}]);
    thinking.textContent=answer;
  }catch(err){
    thinking.textContent="No pude conectar con la IA.\n\n"+err.message+"\n\nRevisa tu API Key, el modelo, la dirección API y si el proveedor permite solicitudes desde el navegador (CORS).";
  }finally{
    setBusy(false);
    if(imageUrl) URL.revokeObjectURL(imageUrl);
    selectedImage=null;$("imageInput").value="";$("attachmentPreview").textContent="";
  }
}

$("openSettings").onclick=openSettings;$("openSettingsTop").onclick=openSettings;
$("closeSettings").onclick=closeSettings;
$("settingsModal").addEventListener("click",e=>{if(e.target===$("settingsModal"))closeSettings();});
$("provider").addEventListener("change",updateProviderHint);
$("saveSettings").onclick=()=>{saveSettings();};
$("loadModels").onclick=loadModels;
$("toggleKey").onclick=()=>{const input=$("apiKey");input.type=input.type==="password"?"text":"password";$("toggleKey").textContent=input.type==="password"?"Ver":"Ocultar";};
$("clearKey").onclick=()=>{$("apiKey").value="";settings.apiKey="";saveSettings();$("settingsStatus").textContent="Clave eliminada de este navegador.";};
$("newChat").onclick=()=>{$("chat").innerHTML="";$("chat").style.display="none";$("welcome").style.display="block";$("prompt").value="";resizePrompt();};
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("show");
document.querySelectorAll(".suggestion").forEach(btn=>btn.addEventListener("click",()=>{$("prompt").value=btn.dataset.prompt;resizePrompt();$("prompt").focus();}));
$("prompt").addEventListener("input",resizePrompt);
$("imageInput").addEventListener("change",e=>{
  selectedImage=e.target.files[0]||null;
  $("attachmentPreview").textContent=selectedImage?`Imagen seleccionada: ${selectedImage.name} (vista previa; envío visual aún no habilitado)`:"";
});
$("composer").addEventListener("submit",async e=>{
  e.preventDefault();const prompt=$("prompt").value.trim();if(!prompt)return;
  $("prompt").value="";resizePrompt();await sendPrompt(prompt);
});
loadSettings();
