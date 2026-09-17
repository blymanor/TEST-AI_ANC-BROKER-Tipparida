const TODAY = new Date(2026, 8, 17);
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EV_MODELS = new Set(["Model 3", "Model Y", "Atto 3", "Dolphin", "4 EV"]);
const TYPE_RANK = ["ชั้น 1", "ชั้น 2+", "ชั้น 3+"];

const state = {
  filter: "today",
  query: "",
  selectedId: null,
  view: "today",
  feedback: "",
};

const customers = MOCK.customers.map((row) => ({
  ...row,
  daysLeft: daysBetween(TODAY, parseISO(row.Policy_Expiry_Date)),
}));

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(from, to) {
  return Math.round((to - from) / 86400000);
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_TH[m - 1]} ${y + 543}`;
}

function formatMoney(n) {
  return `${n.toLocaleString("th-TH")} บาท`;
}

function daysLabel(days) {
  if (days < 0) return `หมดอายุแล้ว ${Math.abs(days)} วัน`;
  if (days === 0) return "หมดอายุวันนี้";
  return `อีก ${days} วัน`;
}

function isEV(customer) {
  return customer.Car_Brand === "Tesla" || customer.Car_Brand === "BYD" || EV_MODELS.has(customer.Car_Model);
}

function carAge(customer) {
  return 2026 - customer.carYear;
}

function scoreCustomer(customer) {
  let urgency = 8;
  if (customer.daysLeft <= 3) urgency = 40;
  else if (customer.daysLeft <= 7) urgency = 32;
  else if (customer.daysLeft <= 14) urgency = 20;
  else if (customer.daysLeft <= 30) urgency = 12;

  const statusScore = {
    "ยังไม่ได้ติดต่อ": 25,
    "ติดต่อแล้ว-ลังเล": 22,
    "ติดต่อแล้ว-ขอส่วนลด": 20,
    "ติดต่อแล้ว-สนใจเปรียบเทียบ": 18,
    "นัดติดตามช่วงบ่าย": 16,
    "กำลังติดต่อ": 14,
    "ติดต่อแล้ว-ปฏิเสธ": 4,
  }[customer.Contact_Status] ?? 12;

  const premiumScore = Math.min(20, Math.round(((customer.premium - 7000) / 38000) * 20));
  const behaviorScore = {
    "ชอบเปลี่ยนบริษัทประกันเพื่อราคา": 15,
    "ต่ออายุเฉียดฉิว": 12,
    "เคยมีประวัติเคลมหนัก": 10,
    "ต่ออายุตรงเวลาเสมอ": 6,
  }[customer.Historical_Renewal_Behavior] ?? 8;

  return Math.max(0, Math.min(100, urgency + statusScore + premiumScore + behaviorScore));
}

function rankOf(score) {
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function rankLabel(rank) {
  return { high: "สูง", medium: "กลาง", low: "ต่ำ" }[rank];
}

function eligibleInsurer(insurer, customer) {
  if (carAge(customer) > insurer.maxAge) return false;
  if (!insurer.brands.includes(customer.Car_Brand)) return false;
  if (String(insurer.Model_List_Scope).startsWith("Model") && !insurer.models.includes(customer.Car_Model)) {
    return false;
  }
  if (String(insurer.excluded).includes("รถยนต์ไฟฟ้า") && isEV(customer)) return false;
  if (String(insurer.Special_Conditions).includes("ไฟฟ้า") && !isEV(customer) && !insurer.models.includes(customer.Car_Model)) {
    return false;
  }
  return true;
}

function rankOffer(insurer, customer) {
  let rank = 0;
  if (insurer.Insurer_Name === customer.Current_Insurer) rank += 100;
  if (insurer.types.includes(customer.Current_Policy_Type)) rank += 50;
  if (insurer.Insurer_Code === "A") rank += 20;
  if (pickType(insurer, customer.Current_Policy_Type) === "ชั้น 1") rank += 10;
  return rank;
}

function pickType(insurer, currentType) {
  if (insurer.types.includes(currentType)) return currentType;
  return TYPE_RANK.find((type) => insurer.types.includes(type)) || insurer.types[0];
}

function recommend(customer) {
  const matches = MOCK.insurers.filter((insurer) => eligibleInsurer(insurer, customer));
  if (!matches.length) return null;

  const chosen = [...matches].sort((a, b) => rankOffer(b, customer) - rankOffer(a, customer))[0];
  const alternative = matches.find((insurer) => insurer.Insurer_Code !== chosen.Insurer_Code) || null;
  const sameInsurer = chosen.Insurer_Name === customer.Current_Insurer;
  const factor = sameInsurer ? 0.97 : 0.92;
  const premium = Math.max(chosen.minPremium, Math.round((customer.premium * factor) / 100) * 100);

  return {
    chosen,
    type: pickType(chosen, customer.Current_Policy_Type),
    premium,
    save: customer.premium - premium,
    alternative: alternative
      ? {
          insurer: alternative,
          type: pickType(alternative, customer.Current_Policy_Type),
          premium: Math.max(alternative.minPremium, Math.round((customer.premium * 0.9) / 100) * 100),
        }
      : null,
  };
}

function reasonsFor(customer) {
  const reasons = [];
  if (customer.daysLeft <= 7) {
    reasons.push({
      title: "ใกล้หมดอายุ",
      detail: `กรมธรรม์หมดอายุ ${formatDate(customer.Policy_Expiry_Date)} (${daysLabel(customer.daysLeft)})`,
    });
  } else {
    reasons.push({
      title: "อยู่ในช่วงต่ออายุ",
      detail: `เหลือเวลา ${customer.daysLeft} วัน ควรนัดติดตามก่อนลูกค้าปิดกับเจ้าอื่น`,
    });
  }

  reasons.push({
    title: customer.Contact_Status === "ยังไม่ได้ติดต่อ" ? "ยังไม่ได้เริ่มคุย" : "มีสถานะที่ต้องติดตาม",
    detail: `สถานะล่าสุด: ${customer.Contact_Status}`,
  });

  reasons.push({
    title: customer.Historical_Renewal_Behavior,
    detail: `เบี้ยปัจจุบัน ${formatMoney(customer.premium)} กับ ${customer.Current_Insurer}`,
  });

  return reasons;
}

function nextAction(customer, offer) {
  if (!offer) {
    return {
      title: "ตรวจเงื่อนไขก่อนเสนอราคา",
      detail: "เคสนี้ยังไม่มีแผนที่ผ่านเกณฑ์รับประกันจากข้อมูล mockup ให้ AE ตรวจกับทีมรับประกันก่อน",
    };
  }
  if (customer.Contact_Status === "ติดต่อแล้ว-ปฏิเสธ") {
    return {
      title: "ไม่ต้องโฟกัสเป็นคิวแรก",
      detail: "ลูกค้าปฏิเสธแล้ว หากยังมีเวลาเหลือ ให้ขยับไปเคสที่ยังไม่ได้คุยก่อน",
    };
  }
  if (customer.Contact_Status === "ติดต่อแล้ว-ขอส่วนลด") {
    return {
      title: "โทรกลับพร้อมเบี้ยที่ปรับแล้ว",
      detail: `ยึดข้อเสนอ ${offer.chosen.Insurer_Name} ${offer.type} แล้วอธิบายส่วนต่างจากเบี้ยเดิม`,
    };
  }
  if (customer.Contact_Status === "ติดต่อแล้ว-ลังเล" || customer.Contact_Status === "ติดต่อแล้ว-สนใจเปรียบเทียบ") {
    return {
      title: "ส่งข้อเปรียบเทียบวันนี้",
      detail: "สรุปความคุ้มครองและเบี้ยให้สั้น แล้วถามวันที่ยืนยันต่ออายุ",
    };
  }
  if (customer.daysLeft <= 3) {
    return {
      title: "โทรหาลูกค้าวันนี้",
      detail: "เปิดด้วยวันหมดอายุ แล้วขออนุญาตส่งข้อเสนอก่อนจบสาย",
    };
  }
  return {
    title: "นัดคุยภายในวันนี้",
    detail: "เริ่มจากแจ้งวันหมดอายุ แล้วถามเวลาที่สะดวกรับรายละเอียด",
  };
}

function draftMessage(customer, offer) {
  const offerLine = offer
    ? `ทางเราตรวจทางเลือก${offer.type} จาก${offer.chosen.Insurer_Name} ไว้ที่ประมาณ ${formatMoney(offer.premium)}`
    : "ทางเราตรวจทางเลือกที่เหมาะกับรถของคุณไว้แล้ว";
  return `สวัสดีค่ะ${customer.Customer_Name} ประกันรถ ${customer.Car_Brand} ${customer.Car_Model} ของคุณจะหมดอายุวันที่ ${formatDate(customer.Policy_Expiry_Date)} ค่ะ ${offerLine} หากสะดวก ดิฉันขอส่งรายละเอียดให้เปรียบเทียบได้เลยนะคะ`;
}

function matchesQuery(customer, query) {
  if (!query) return true;
  const hay = [
    customer.Customer_Name,
    customer.Customer_ID,
    customer.Car_Brand,
    customer.Car_Model,
    customer.Phone_Number,
    customer.Current_Insurer,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

function visibleCustomers() {
  const query = state.query.trim().toLowerCase();
  return customers
    .filter((customer) => {
      if (state.filter === "today" && customer.daysLeft > 7) return false;
      if (state.filter === "open" && customer.Contact_Status !== "ยังไม่ได้ติดต่อ") return false;
      return matchesQuery(customer, query);
    })
    .sort((a, b) => scoreCustomer(b) - scoreCustomer(a) || a.daysLeft - b.daysLeft);
}

function selectedCustomer() {
  return customers.find((customer) => customer.Customer_ID === state.selectedId) || visibleCustomers()[0] || customers[0];
}

function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "className") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "hidden") node.hidden = Boolean(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  });
  kids.flat().forEach((kid) => {
    if (kid == null || kid === false) return;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  });
  return node;
}

function fact(label, value, options = {}) {
  const strong = h("strong", options.urgent ? { className: "urgent" } : {}, options.link
    ? h("a", { href: options.link }, value)
    : value);
  return h("span", {}, h("small", { text: label }), strong);
}

function renderQueue() {
  const list = visibleCustomers();
  const queue = document.querySelector("#queue");
  if (!list.length) {
    queue.replaceChildren(h("p", { className: "empty-rail", text: "ไม่พบลูกค้าตามเงื่อนไขนี้" }));
    return;
  }

  if (!list.some((customer) => customer.Customer_ID === state.selectedId)) {
    state.selectedId = list[0].Customer_ID;
  }

  queue.replaceChildren(
    ...list.map((customer) => {
      const score = scoreCustomer(customer);
      const rank = rankOf(score);
      return h(
        "button",
        {
          className: `queue-item${customer.Customer_ID === state.selectedId ? " is-selected" : ""}`,
          type: "button",
          dataset: { id: customer.Customer_ID },
        },
        h("strong", { text: customer.Customer_Name }),
        h("span", { className: `level ${rank}`, text: rankLabel(rank) }),
        h("span", { className: "sub", text: `${customer.Car_Brand} ${customer.Car_Model}` }),
        h("span", { className: "meta", text: `${daysLabel(customer.daysLeft)}  ${customer.Contact_Status}` })
      );
    })
  );
}

function renderCriteria() {
  const items = [
    ["วันที่เหลือถึงหมดอายุ", "เคสที่เหลือน้อยกว่า 7 วันขึ้นก่อน เพราะโอกาสหลุดไปเจ้าอื่นสูงสุดในช่วงนี้"],
    ["สถานะการติดต่อ", "ยังไม่ได้ติดต่อ ลังเล ขอส่วนลด หรือสนใจเปรียบเทียบ มีน้ำหนักมากกว่าเคสที่ปฏิเสธแล้ว"],
    ["มูลค่าเบี้ยปัจจุบัน", "เบี้ยสูงกว่ามีผลต่อรายได้ที่ต้องรักษา จึงถูกดันขึ้นมาในคิว"],
    ["พฤติกรรมต่ออายุในอดีต", "ลูกค้าที่ชอบย้ายบริษัทเพื่อราคา หรือต่ออายุเฉียดฉิว ต้องคุยก่อนลูกค้าที่ต่อตรงเวลาเสมอ"],
  ];

  return h(
    "article",
    { className: "criteria" },
    h("h2", { text: "เกณฑ์การจัดลำดับ" }),
    h("p", { text: "คิวงานเรียงจากคะแนน 0 ถึง 100 โดยใช้ข้อมูลในไฟล์ mockup ไม่ได้สุ่มลำดับ" }),
    h(
      "ol",
      { className: "criteria-list" },
      ...items.map(([title, detail]) => h("li", {}, h("strong", { text: title }), h("span", { text: detail })))
    )
  );
}

function renderOffer(customer, offer) {
  if (!offer) {
    return [
      h("p", {
        className: "no-match",
        text: "ไม่มีบริษัทที่แนะนำได้ (No_Match) จากเกณฑ์ใน Underwriting_Rule_Matrix",
      }),
    ];
  }

  const saveText = offer.save > 0 ? `ประหยัดจากเบี้ยเดิม ${formatMoney(offer.save)}` : "ใกล้เคียงเบี้ยเดิม";
  const alt = offer.alternative
    ? h("p", {
        id: "alternativeOffer",
        className: "alt-offer",
        hidden: true,
        text: `ทางเลือกถัดไป: ${offer.alternative.insurer.Insurer_Name} ${offer.alternative.type} ประมาณ ${formatMoney(offer.alternative.premium)}`,
      })
    : null;

  return [
    h(
      "div",
      { className: "offer-main" },
      h("p", {}, h("strong", { text: offer.chosen.Insurer_Name }), h("small", { text: `${offer.type} สำหรับ ${customer.Car_Brand} ${customer.Car_Model} ปี ${customer.Car_Year}` })),
      h("div", { className: "offer-price" }, h("small", { text: "เบี้ยแนะนำ" }), h("strong", { text: formatMoney(offer.premium) }))
    ),
    h("div", { className: "chips" }, h("span", { text: saveText }), h("span", { text: `อายุรถ ${carAge(customer)} ปี` })),
    alt,
    h("p", { className: "approval-note", text: "ก่อนส่งราคา ให้ตรวจเงื่อนไขรับประกันและรายละเอียดความคุ้มครองจริงอีกครั้ง" }),
  ];
}

function renderCase() {
  const view = document.querySelector("#caseView");
  if (state.view === "criteria") {
    view.replaceChildren(renderCriteria());
    return;
  }

  const customer = selectedCustomer();
  if (!customer) {
    view.replaceChildren(h("p", { className: "empty-rail", text: "ยังไม่มีเคสในคิวนี้" }));
    return;
  }

  const score = scoreCustomer(customer);
  const rank = rankOf(score);
  const offer = recommend(customer);
  const action = nextAction(customer, offer);
  const reasons = reasonsFor(customer);
  const message = draftMessage(customer, offer);

  const moreButton = offer && offer.alternative
    ? h("button", {
        id: "moreOffersButton",
        className: "link-button",
        type: "button",
        "aria-expanded": "false",
        text: "ดูทางเลือกอื่น",
        onClick: (event) => {
          const altNode = document.querySelector("#alternativeOffer");
          if (!altNode) return;
          const open = altNode.hidden;
          altNode.hidden = !open;
          event.currentTarget.setAttribute("aria-expanded", String(open));
          event.currentTarget.textContent = open ? "ซ่อนทางเลือก" : "ดูทางเลือกอื่น";
        },
      })
    : null;

  view.replaceChildren(
    h(
      "header",
      { className: "case-header" },
      h("p", { className: "case-kicker", text: customer.Customer_ID }),
      h(
        "div",
        { className: "case-title-row" },
        h("h2", { id: "case-title" }, customer.Customer_Name, h("span", { text: `${customer.Car_Brand} ${customer.Car_Model} ปี ${customer.Car_Year}` })),
        h(
          "div",
          { className: `priority-block ${rank}`, "aria-label": `ความสำคัญ ${rankLabel(rank)} คะแนน ${score} จาก 100` },
          h("span", { text: "ความสำคัญ" }),
          h("b", { text: rankLabel(rank) }),
          h("small", { text: `${score} / 100` })
        )
      ),
      h(
        "div",
        { className: "case-facts" },
        fact("ประกันเดิม", customer.Current_Policy_Type),
        fact("บริษัทเดิม", customer.Current_Insurer),
        fact("เบี้ยเดิม", formatMoney(customer.premium)),
        fact("หมดอายุ", daysLabel(customer.daysLeft), { urgent: customer.daysLeft <= 7 }),
        fact("สถานะ", customer.Contact_Status),
        fact("โทร", customer.Phone_Number, { link: `tel:${customer.Phone_Number}` })
      )
    ),
    h(
      "section",
      { className: "focus-panel" },
      h("div", {}, h("h3", { text: action.title }), h("p", { text: action.detail })),
      h(
        "div",
        { className: "focus-action" },
        h("button", {
          className: "primary-button",
          type: "button",
          text: "เริ่มโทรหา",
          onClick: () => {
            customer.Contact_Status = "กำลังติดต่อ";
            state.feedback = "เริ่มงานแล้ว เลือกผลหลังคุยเสร็จเพื่อให้ระบบจัดคิวต่อ";
            refresh();
          },
        }),
        h("button", {
          className: "text-button",
          type: "button",
          text: "เลื่อนไปช่วงบ่าย",
          onClick: () => {
            customer.Contact_Status = "นัดติดตามช่วงบ่าย";
            state.feedback = "เลื่อนเป็นช่วงบ่ายแล้ว เคสนี้ยังอยู่ในคิววันนี้";
            refresh();
          },
        }),
        h("p", { className: "action-feedback", "aria-live": "polite", text: state.feedback })
      )
    ),
    h(
      "section",
      { className: "work-grid" },
      h(
        "div",
        {},
        h(
          "section",
          { id: "insight", className: "section-block" },
          h("div", { className: "section-heading" }, h("h3", { text: "เหตุผลที่ขึ้นคิวก่อน" }), h("span", { className: "score" }, "คะแนน ", h("strong", { text: String(score) }), "/100")),
          h(
            "ul",
            { className: "reasons" },
            ...reasons.map((item) => h("li", {}, h("strong", { text: item.title }), h("span", { text: item.detail })))
          )
        ),
        h(
          "section",
          { className: "section-block" },
          h("div", { className: "section-heading" }, h("h3", { text: "เริ่มด้วยข้อเสนอนี้" }), moreButton),
          ...renderOffer(customer, offer)
        )
      ),
      h(
        "aside",
        {},
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "section-heading" },
            h("h3", { text: "พูดกับลูกค้าแบบนี้" }),
            h("button", {
              className: "copy-button",
              type: "button",
              text: "คัดลอก",
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  state.feedback = "คัดลอกข้อความแนะนำแล้ว";
                } catch {
                  state.feedback = "เลือกข้อความด้านขวาเพื่อคัดลอกได้เลย";
                }
                const feedbackNode = document.querySelector(".action-feedback");
                if (feedbackNode) feedbackNode.textContent = state.feedback;
              },
            })
          ),
          h("div", { className: "message-draft", text: message })
        ),
        h(
          "section",
          { className: "panel" },
          h("h3", { text: "คุยแล้วเป็นอย่างไร" }),
          h(
            "div",
            { className: "outcome-actions" },
            ...[
              ["ติดต่อแล้ว-สนใจเปรียบเทียบ", "สนใจรับข้อเสนอ"],
              ["ติดต่อแล้ว-ลังเล", "ขอติดต่อกลับ"],
              ["ติดต่อแล้ว-ปฏิเสธ", "ยังไม่สนใจ"],
            ].map(([value, label]) =>
              h("button", {
                type: "button",
                text: label,
                className: customer.Contact_Status === value ? "is-selected" : "",
                onClick: () => {
                  customer.Contact_Status = value;
                  state.feedback = `บันทึกผลแล้ว: ${label}`;
                  refresh();
                },
              })
            )
          )
        )
      )
    )
  );
}

function refreshRailCopy() {
  const titles = { today: "งานวันนี้", open: "ยังไม่ติดต่อ", all: "ลูกค้าทั้งหมด" };
  document.querySelector("#railDate").textContent = "17 ก.ย. 2569";
  document.querySelector("#railTitle").textContent = titles[state.filter];
  document.querySelector("#railCount").textContent = `${visibleCustomers().length} จาก 100 ราย`;
}

function refresh() {
  renderQueue();
  renderCase();
  refreshRailCopy();
}

function setNav(view) {
  state.view = view;
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.view === view);
  });
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll(".filter").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.filter === filter);
  });
}

document.querySelector("#queue").addEventListener("click", (event) => {
  const item = event.target.closest(".queue-item");
  if (!item) return;
  state.feedback = "";
  state.selectedId = item.dataset.id;
  setNav(state.filter === "all" ? "all" : "today");
  refresh();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.feedback = "";
    setFilter(button.dataset.filter);
    setNav(button.dataset.filter === "all" ? "all" : "today");
    refresh();
  });
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    state.feedback = "";
    const view = button.dataset.view;
    setNav(view);
    if (view !== "criteria") setFilter(view === "all" ? "all" : "today");
    refresh();
  });
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  refresh();
});

refresh();
