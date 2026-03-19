/**
 * Formats order data into a 32-character-wide ASCII ticket for thermal printers
 * Compatible with standard 32-column thermal receipt printers (Epson TM-T88, Star TSP100, etc.)
 */

export interface TicketOrder {
  id: string;
  createdAt: string;
}

export interface TicketItem {
  name: string;
  variantName?: string | null;
  quantity: number;
  price: number;
  modifications?: string | null;
}

/**
 * Formats order data into a 32-character-wide ASCII ticket for thermal printers
 * @param order - Order metadata (id, createdAt)
 * @param items - Array of order items with product name, variant, quantity, price, modifications
 * @returns string - Formatted ticket, exactly 32 chars per line, ASCII only
 */
export function formatKitchenTicket(order: TicketOrder, items: TicketItem[]): string {
  // Helper: remove non-ASCII, pad/truncate to exact width
  const fit = (text: string, width: number, align: "left" | "right" | "center" = "left"): string => {
    const clean = text.replace(/[^\x20-\x7E]/g, ""); // Remove non-ASCII
    if (clean.length >= width) return clean.slice(0, width);
    
    if (align === "center") {
      const left = Math.floor((width - clean.length) / 2);
      const right = width - clean.length - left;
      return " ".repeat(left) + clean + " ".repeat(right);
    } else if (align === "right") {
      return clean.padStart(width);
    } else {
      return clean.padEnd(width);
    }
  };

  const lines: string[] = [];
  const separator = "--------------------------------"; // exactly 32 dashes

  // Header
  lines.push(fit("BISTRO BUZZER", 32, "center"));
  lines.push(fit("Kitchen Ticket", 32, "center"));
  lines.push(separator);
  lines.push(fit(`Order: ${order.id}`, 32, "left").slice(0, 32));
  
  const time = new Date(order.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  lines.push(fit(`Time: ${time}`, 32, "left").slice(0, 32));
  lines.push(separator);
  lines.push(""); // Blank line before items

  // Items list
  let total = 0;
  for (const item of items) {
    const lineTotal = item.price * item.quantity;
    total += lineTotal;

    // Main item line: "2x Pizza Margherita (Large)  12.50"
    let itemLine = `${item.quantity}x ${item.name}`;
    if (item.variantName) itemLine += ` (${item.variantName})`;

    // Truncate item name if too long (reserve 7 chars for price: "  999.99")
    const maxNameLen = 32 - 7;
    if (itemLine.length > maxNameLen) {
      itemLine = itemLine.slice(0, maxNameLen - 3) + "...";
    }

    const priceStr = lineTotal.toFixed(2);
    const itemLineFormatted = itemLine.padEnd(25) + priceStr.padStart(7);
    lines.push(itemLineFormatted.slice(0, 32));

    // Modifications: indented, wrapped if needed
    if (item.modifications) {
      const modPrefix = "  > ";
      const modText = item.modifications.replace(/[^\x20-\x7E]/g, ""); // Remove non-ASCII
      
      // Simple word wrap at 32 chars
      const words = modText.split(" ");
      let currentLine = modPrefix;
      for (const word of words) {
        if ((currentLine + word).length <= 32) {
          currentLine += word + " ";
        } else {
          if (currentLine.trim()) {
            lines.push(currentLine.trim().padEnd(32).slice(0, 32));
          }
          currentLine = "    " + word + " "; // Indent continuation
        }
      }
      if (currentLine.trim()) {
        lines.push(currentLine.trim().padEnd(32).slice(0, 32));
      }
    }
    lines.push(""); // Blank line between items
  }

  lines.push(separator);
  const totalStr = total.toFixed(2);
  const totalLine = "TOTAL: " + totalStr.padStart(24);
  lines.push(totalLine.padEnd(32).slice(0, 32));
  lines.push("");
  lines.push(fit("Thank you!", 32, "center"));

  // Ensure every line is exactly 32 chars
  return lines.map((line) => line.padEnd(32).slice(0, 32)).join("\n");
}
