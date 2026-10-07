import type { ScreenId, UssdScreen } from "../types.js";
import { confirmScreen } from "./confirm.js";
import { eventsScreen } from "./events.js";
import { helpScreen } from "./help.js";
import { paymentScreen } from "./paymentMethod.js";
import { quantityScreen } from "./quantity.js";
import { ticketsScreen } from "./tickets.js";
import { welcomeScreen } from "./welcome.js";

export const screens: Record<ScreenId, UssdScreen> = {
  welcome: welcomeScreen,
  events: eventsScreen,
  quantity: quantityScreen,
  payment: paymentScreen,
  confirm: confirmScreen,
  tickets: ticketsScreen,
  help: helpScreen,
};
