import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type {Text} from "./shared";
export const operationLabels:Record<string,TranslationKey>={
  QUARANTINE_HOLD:"wms.quantity_quarantine",QUARANTINE_RELEASE:"wms.quarantine_release",WRITE_OFF:"wms.approved_write_off",
  ADJUSTMENT:"wms.physical_count_adjustment",
  DISPATCHED:"wms.dispatched_handover_pending",COMPLETED:"wms.supplier_handover_confirmed",SUPPLIER_RETURN:"wms.supplier_return",REP_RETURN:"wms.representative_return",QUALITY_HOLD:"wms.quality_block",QUALITY_RELEASE:"wms.quality_unblock",
  "supplier.create":"wms.create_supplier_return","supplier.submit":"wms.submit_supplier_return","supplier.review":"wms.review_supplier_return","supplier.post":"wms.approve_dispatch_return","supplier.confirm":"wms.confirm_supplier_handover","supplier.cancel":"wms.cancel_supplier_return",
  "rep-return.create":"wms.create_rep_return","rep-return.submit":"wms.submit_rep_return","rep-return.review":"wms.review_rep_return","rep-return.post":"wms.approve_post_return","rep-return.cancel":"wms.cancel_rep_return",
  DRAFT:"wms.draft",SUBMITTED:"wms.submitted",REVIEWED:"wms.reviewed",POSTED:"wms.posted_790b384",CANCELLED:"wms.cancelled_e297854",REVERSED:"wms.reversed",
  REQUESTED:"wms.requested",RESERVED:"wms.reserved",PICKED:"wms.picked",APPROVED:"wms.dispatch_approved",IN_TRANSIT:"wms.in_transit_custody_pending",ACCEPTED:"wms.custody_accepted",RETURN_REQUESTED:"wms.rejected_return_pending",RETURNED:"wms.returned_into_quarantine",
  "receipt.create":"wms.create_receipt","receipt.edit":"wms.edit_draft","receipt.submit":"wms.submit_receipt","receipt.review":"wms.review_receipt","receipt.return-draft":"wms.return_to_draft","receipt.approve":"wms.approve_post_receipt","receipt.cancel":"wms.cancel_receipt","receipt.reverse":"wms.reverse_receipt",
  "load.create":"wms.create_loading_request","load.reserve":"wms.reserve_fefo_stock","load.pick":"wms.confirm_actual_picking","load.review":"wms.review_picking","load.approve":"wms.approve_dispatch","load.dispatch":"wms.dispatch_into_transit","load.cancel":"wms.cancel_release_reservation","load.accept":"wms.accept_custody","load.reject":"wms.reject_delivery","load.receive-return":"wms.confirm_return_into_quarantine",
  OPENING:"wms.opening",REVERSAL:"wms.opening_reversal",RECEIPT:"wms.receipt",RECEIPT_REVERSAL:"wms.receipt_reversal",RESERVE:"wms.reserve",RELEASE:"wms.release",DISPATCH:"wms.dispatch",ACCEPT:"wms.custody_acceptance",TRANSIT_RETURN:"wms.transit_return",
};
export function operationText(value:string,t:Text){const l=operationLabels[value];return l?t(l):value;}
