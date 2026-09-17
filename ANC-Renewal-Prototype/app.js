const feedback = document.querySelector("#actionFeedback");
const contactStatus = document.querySelector("#contactStatus");
const messageDraft = document.querySelector("#messageDraft");
const queue = document.querySelector("#queue");
const alternativeOffer = document.querySelector("#alternativeOffer");
const moreOffersButton = document.querySelector("#moreOffersButton");

function setFeedback(text) {
  feedback.textContent = text;
}

document.querySelector("#callButton").addEventListener("click", () => {
  contactStatus.textContent = "กำลังติดต่อ";
  setFeedback("เริ่มงานแล้ว เลือกผลลัพธ์หลังคุยเสร็จเพื่อให้ระบบจัดงานต่อไป");
  document.querySelector(".outcome-card").scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelector("#snoozeButton").addEventListener("click", () => {
  contactStatus.textContent = "นัดติดตามช่วงบ่าย";
  setFeedback("เลื่อนงานเป็นช่วงบ่ายแล้ว ระบบจะคงเคสนี้ไว้เป็นลำดับแรก");
});

moreOffersButton.addEventListener("click", () => {
  const isHidden = alternativeOffer.hidden;
  alternativeOffer.hidden = !isHidden;
  moreOffersButton.setAttribute("aria-expanded", String(isHidden));
  moreOffersButton.textContent = isHidden ? "ซ่อนทางเลือก" : "ดูอีก 1 ทางเลือก";
});

document.querySelector("#copyButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(messageDraft.textContent);
    setFeedback("คัดลอกข้อความแนะนำแล้ว");
  } catch {
    setFeedback("เลือกข้อความด้านขวาเพื่อคัดลอกได้เลย");
  }
});

document.querySelectorAll("[data-outcome]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-outcome]").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    contactStatus.textContent = button.dataset.outcome;
    setFeedback(`บันทึกผลแล้ว: ${button.dataset.outcome}`);
  });
});

queue.addEventListener("click", (event) => {
  const item = event.target.closest(".queue-item");
  if (!item) return;
  document.querySelectorAll(".queue-item").forEach((row) => row.classList.remove("selected"));
  item.classList.add("selected");
  if (item.dataset.customer !== "A") {
    setFeedback(`เลือก ${item.querySelector("strong").textContent} เป็นเคสถัดไปแล้ว ตอนนี้ยังแสดงรายละเอียด Prototype ของลูกค้า A`);
  } else {
    setFeedback("กลับมาที่เคสลูกค้า A แล้ว");
  }
});
