const routes = {
  dashboard: { title: "Visão geral", eyebrow: "Painel" },
  mercado: { title: "Mercado", eyebrow: "XAUUSD" },
  operacoes: { title: "Operações", eyebrow: "Histórico" },
  sinais: { title: "Sinais", eyebrow: "Central de sinais" },
  conta: { title: "Minha conta", eyebrow: "Perfil e ambiente" },
};

const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");
let toastTimer;

function currentRoute() {
  const route = window.location.hash.replace("#", "");
  return routes[route] ? route : "dashboard";
}

function showRoute(route) {
  const target = routes[route] ? route : "dashboard";
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === target);
  });
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === target);
  });
  document.querySelector("#page-title").textContent = routes[target].title;
  document.querySelector("#page-eyebrow").textContent = routes[target].eyebrow;
  sidebar.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openInfo(kind = "info") {
  const title = document.querySelector("#modal-title");
  const text = document.querySelector("#modal-text");
  const messages = {
    info: [
      "TOKAI INVEST é uma demonstração visual",
      "Este protótipo não possui acesso ao MT5, corretoras, saldo de clientes ou preços ao vivo. Nenhum botão nesta página executa ordens.",
    ],
    operation: [
      "Registro apenas ilustrativo",
      "Para manter este ambiente seguro e claro, o protótipo não permite registrar operações reais nem simular a execução em uma corretora.",
    ],
    signal: [
      "Sinal de demonstração",
      "Os níveis apresentados são fictícios e existem somente para mostrar a interface. Eles não constituem recomendação de investimento ou instrução de negociação.",
    ],
  };
  [title.textContent, text.textContent] = messages[kind] || messages.info;
  modal.hidden = false;
  document.querySelector("#modal-confirm").focus();
}

function closeInfo() {
  modal.hidden = true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function updateSimulatedQuote() {
  const basePrice = 2345.78;
  const adjustment = (Math.random() - 0.5) * 0.36;
  const price = (basePrice + adjustment).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percentage = (0.42 + adjustment / 10).toFixed(2).replace(".", ",");
  document.querySelector("#quote-price").textContent = price;
  document.querySelector("#quote-change").textContent = `+${percentage}%`;
  document.querySelector("#market-price").textContent = price;
  document.querySelector("#market-change").textContent = `+9,84 (+${percentage}%)`;
}

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.hash = button.dataset.go;
  });
});

document.querySelectorAll("[data-open-modal]").forEach((button) => {
  button.addEventListener("click", () => openInfo(button.dataset.openModal));
});

document.querySelector("#help-button").addEventListener("click", () => openInfo());
document.querySelector("#modal-close").addEventListener("click", closeInfo);
document.querySelector("#modal-confirm").addEventListener("click", closeInfo);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeInfo();
});

menuToggle.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

document.querySelector("#new-signal").addEventListener("click", () => {
  showToast("Exemplo de sinal criado apenas nesta sessão de demonstração.");
});

document.querySelectorAll(".time-switcher button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".time-switcher button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    showToast(`Visualização ${button.textContent} atualizada com dados ilustrativos.`);
  });
});

window.addEventListener("hashchange", () => showRoute(currentRoute()));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeInfo();
});

document.querySelector("#year").textContent = new Date().getFullYear();
showRoute(currentRoute());
setInterval(updateSimulatedQuote, 7000);
