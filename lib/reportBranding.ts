import type { jsPDF } from "jspdf";

export const reportSubtitle = "POSM Deployment & Intelligence Platform";
export const reportFooter = "DeployIQ\u2122 | Powered by Impact Visibility Ltd";

export function createReportId(prefix = "DPIQ") {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${prefix}-${stamp}`;
}

export function drawDeployIqLogo(doc: jsPDF, x: number, y: number, width = 31, height = 13) {
  doc.setFillColor(3, 10, 28);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("Deploy", x + 3.5, y + 8.5);
  doc.setTextColor(255, 138, 61);
  doc.text("IQ", x + 20.8, y + 8.5);
  doc.setTextColor(15, 23, 42);
}

export function drawReportHeader(
  doc: jsPDF,
  pageWidth: number,
  title: string,
  metadata: Array<[string, string]>,
  options: { margin?: number; top?: number } = {}
) {
  const margin = options.margin ?? 14;
  const top = options.top ?? 12;
  drawDeployIqLogo(doc, margin, top);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("DeployIQ", margin + 38, top + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(reportSubtitle, margin + 38, top + 10.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, top + 18, pageWidth - margin, top + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, top + 29);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  let y = top + 37;
  metadata.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, margin, y);
    y += 5;
  });
  doc.setTextColor(15, 23, 42);
}

export function drawReportFooter(doc: jsPDF, pageWidth: number, pageHeight: number, margin = 14) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    drawDeployIqLogo(doc, margin, pageHeight - 9, 22, 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(reportFooter, margin + 27, pageHeight - 3.5);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 3.5, { align: "right" });
    doc.setTextColor(15, 23, 42);
  }
}
