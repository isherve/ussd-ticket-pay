import type { ScreenId, UssdScreen } from "../types.js";
import { confirmScreen } from "./confirm.js";
import { eventsScreen } from "./events.js";
import { helpScreen } from "./help.js";
import { paymentScreen } from "./paymentMethod.js";
import { quantityScreen } from "./quantity.js";
import { sendAmountScreen } from "./sendAmount.js";
import { sendConfirmScreen } from "./sendConfirm.js";
import { sendPhoneScreen } from "./sendPhone.js";
import { splitAmountScreen } from "./splitAmount.js";
import { splitConfirmScreen } from "./splitConfirm.js";
import { splitPeopleScreen } from "./splitPeople.js";
import { ticketsScreen } from "./tickets.js";
import { topupAmountScreen } from "./topupAmount.js";
import { walletScreen } from "./wallet.js";
import { welcomeScreen } from "./welcome.js";

export const screens: Record<ScreenId, UssdScreen> = {
  welcome: welcomeScreen,
  events: eventsScreen,
  quantity: quantityScreen,
  payment: paymentScreen,
  confirm: confirmScreen,
  tickets: ticketsScreen,
  help: helpScreen,
  wallet: walletScreen,
  sendPhone: sendPhoneScreen,
  sendAmount: sendAmountScreen,
  sendConfirm: sendConfirmScreen,
  splitAmount: splitAmountScreen,
  splitPeople: splitPeopleScreen,
  splitConfirm: splitConfirmScreen,
  topupAmount: topupAmountScreen,
};
