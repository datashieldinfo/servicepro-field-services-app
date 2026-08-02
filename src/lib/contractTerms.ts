/**
 * The terms and conditions printed on a maintenance contract.
 *
 * Written for a water-treatment maintenance contract issued in Jordan and
 * referring to the law it is signed under: the Civil Code No. 43 of 1976, the
 * Consumer Protection Law No. 7 of 2017 and the Electronic Transactions Law
 * No. 15 of 2015. The Arabic wording is the one that governs — the English is a
 * courtesy translation, which is what the closing clause says.
 *
 * THIS IS A TEMPLATE, NOT LEGAL ADVICE. Have a Jordanian lawyer read it once
 * before the first contract goes out, then bump TERMS_VERSION so a printed copy
 * can always be traced back to the wording it was signed under.
 */

export const TERMS_VERSION = '2026-08 v1';

export interface ContractClause {
  ar: string;
  en: string;
}

/** Filled in by the print component from the contract being printed. */
export interface ContractTermsContext {
  /** Notice period, in days, for cancelling early. */
  noticeDays: number;
  /** How long a repair is warranted, in days. */
  repairWarrantyDays: number;
  /** Days the customer has to settle an invoice. */
  paymentDays: number;
}

export const DEFAULT_TERMS_CONTEXT: ContractTermsContext = {
  noticeDays: 30,
  repairWarrantyDays: 90,
  paymentDays: 15,
};

export function contractClauses(ctx: ContractTermsContext = DEFAULT_TERMS_CONTEXT): ContractClause[] {
  return [
    {
      ar: `يخضع هذا العقد لأحكام القانون المدني الأردني رقم (43) لسنة 1976 وتعديلاته، وقانون حماية المستهلك رقم (7) لسنة 2017، وتُعدّ مقدمة العقد وملاحقه جزءاً لا يتجزأ منه.`,
      en: `This contract is governed by the Jordanian Civil Code No. 43 of 1976 and its amendments, and by Consumer Protection Law No. 7 of 2017. The preamble and any annexes form an integral part of it.`,
    },
    {
      ar: `يلتزم الطرف الأول (الشركة) بتنفيذ زيارات الصيانة الدورية المبيّنة في هذا العقد للأجهزة المدرجة أدناه، وتشمل الزيارة الفحص الفني وقياس نسبة الأملاح الذائبة (TDS) وتنظيف الجهاز واستبدال الفلاتر المستحقة حسب نوع الفلتر المتعاقد عليه (منزلي أو صناعي).`,
      en: `The First Party (the Company) shall carry out the periodic maintenance visits stated in this contract for the devices listed below. A visit covers technical inspection, TDS measurement, cleaning of the unit and replacement of the filters then due, according to the contracted filter class (home or industrial).`,
    },
    {
      ar: `يشمل بدل العقد أجور اليد العاملة والزيارات المتفق عليها. أما الفلاتر وقطع الغيار والمواد الاستهلاكية فتُحتسب وفق قائمة الأسعار المعتمدة لدى الشركة ما لم يُنص صراحةً في هذا العقد على أنها مشمولة.`,
      en: `The contract fee covers labour and the agreed visits. Filters, spare parts and consumables are charged according to the Company's approved price list unless this contract expressly states that they are included.`,
    },
    {
      ar: `يلتزم الطرف الثاني (العميل) بتمكين فنيي الشركة من الوصول إلى الجهاز في الموعد المتفق عليه وتوفير مصدر مياه وكهرباء مناسبين. وفي حال تعذّر تنفيذ الزيارة لسبب يعود للعميل بعد الوصول إلى الموقع، تُحتسب الزيارة من ضمن الزيارات المشمولة بالعقد.`,
      en: `The Second Party (the Customer) shall give the Company's technicians access to the device at the agreed time and provide a suitable water and power supply. If a visit cannot be performed for a reason attributable to the Customer after the technician has arrived on site, that visit counts against the visits included in this contract.`,
    },
    {
      ar: `تُدفع قيمة العقد وفق الدفعات المتفق عليها، وتُسدَّد الفواتير خلال (${ctx.paymentDays}) يوماً من تاريخ إصدارها. ولا تُعتبر أي دفعة مسدَّدة إلا بموجب سند قبض أو إشعار تحويل صادر عن الشركة.`,
      en: `The contract value is payable in the agreed instalments, and invoices are settled within ${ctx.paymentDays} days of issue. No payment is treated as made except against a receipt or transfer advice issued by the Company.`,
    },
    {
      ar: `تضمن الشركة أعمال الصيانة المنفَّذة لمدة (${ctx.repairWarrantyDays}) يوماً من تاريخ الزيارة، وتضمن قطع الغيار الأصلية وفق ضمان المُصنِّع. ولا يشمل الضمان الأعطال الناتجة عن سوء الاستعمال أو العبث بالجهاز أو تدخّل جهة غير معتمدة أو انقطاع التيار الكهربائي أو رداءة مصدر المياه أو ارتفاع ضغطها عن الحد المسموح.`,
      en: `The Company warrants the maintenance work performed for ${ctx.repairWarrantyDays} days from the date of the visit, and warrants genuine spare parts per the manufacturer's warranty. The warranty does not cover faults arising from misuse, tampering, work by an unauthorised party, power interruption, poor water quality or water pressure above the permitted limit.`,
    },
    {
      ar: `تبقى الأجهزة المركّبة ملكاً للعميل، ويلتزم بعدم نقل الجهاز أو فكّه أو تركيب فلاتر غير أصلية أو من فئة مخالفة لنوع الاستخدام المتعاقد عليه، وإلا سقط حقه في الضمان المنصوص عليه أعلاه.`,
      en: `The installed devices remain the property of the Customer, who undertakes not to move or dismantle the device, and not to fit non-genuine filters or filters of a class other than the contracted usage type; doing so voids the warranty above.`,
    },
    {
      ar: `مدة هذا العقد هي المدة المبيّنة في صدره، ويُجدَّد تلقائياً لمدة مماثلة ما لم يُشعر أحد الطرفين الآخر خطياً برغبته بعدم التجديد قبل (${ctx.noticeDays}) يوماً من تاريخ الانتهاء، وذلك في حال تفعيل خيار التجديد التلقائي.`,
      en: `This contract runs for the period stated at its head and renews automatically for a like period unless either party notifies the other in writing of its wish not to renew at least ${ctx.noticeDays} days before expiry, where the automatic renewal option is enabled.`,
    },
    {
      ar: `يحق لأي من الطرفين إنهاء العقد بإشعار خطي مسبق مدته (${ctx.noticeDays}) يوماً، على أن تُسوّى المستحقات عن الزيارات المنفَّذة والمواد المستهلكة حتى تاريخ الإنهاء، ولا يُرَدّ بدل الزيارات المستهلكة.`,
      en: `Either party may terminate this contract on ${ctx.noticeDays} days' prior written notice, provided that amounts due for visits already performed and materials already consumed up to the termination date are settled. Fees for visits already used are non-refundable.`,
    },
    {
      ar: `لا تتحمل الشركة المسؤولية عن التأخير أو عدم التنفيذ الناشئ عن قوة قاهرة وفق أحكام المادتين (247) و(248) من القانون المدني الأردني، بما في ذلك انقطاع المياه أو الكهرباء العام أو القرارات الحكومية أو الظروف الاستثنائية.`,
      en: `The Company is not liable for delay or non-performance caused by force majeure within the meaning of Articles 247 and 248 of the Jordanian Civil Code, including general water or power outages, governmental decisions or exceptional circumstances.`,
    },
    {
      ar: `تلتزم الشركة بالمحافظة على سرية بيانات العميل وعدم استخدامها لغير أغراض تنفيذ هذا العقد، وللعميل حق الاطلاع على سجل زياراته وتقارير الفحص الخاصة به.`,
      en: `The Company shall keep the Customer's data confidential and use it only to perform this contract. The Customer has the right to review their visit history and inspection reports.`,
    },
    {
      ar: `يُعتد بالنسخة الإلكترونية من هذا العقد وبالتوقيع الإلكتروني عليها وفق أحكام قانون المعاملات الإلكترونية رقم (15) لسنة 2015، كما يُعتد بالمراسلات عبر البريد الإلكتروني أو الواتساب المسجَّلة لدى الطرفين وسيلةً للإشعار.`,
      en: `An electronic copy of this contract and an electronic signature on it are valid under the Electronic Transactions Law No. 15 of 2015. Correspondence by email or WhatsApp to the numbers and addresses recorded by both parties is a valid means of notice.`,
    },
    {
      ar: `يُحرَّر هذا العقد من نسختين أصليتين، بيد كل طرف نسخة للعمل بموجبها. وتختص محاكم عمّان بالنظر في أي نزاع ينشأ عن تفسيره أو تنفيذه، ويُعتد بالنص العربي عند اختلافه مع الترجمة الإنجليزية.`,
      en: `This contract is executed in two originals, one held by each party. The courts of Amman have jurisdiction over any dispute arising from its interpretation or performance. In case of divergence, the Arabic text prevails over the English translation.`,
    },
  ];
}
