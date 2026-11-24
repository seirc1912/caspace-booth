/** The four real steps of the customer print flow. */
export const flowSteps = ['Số điện thoại', 'Phòng', 'Ghép khung', 'Gửi in'] as const
export type FlowStep = 1 | 2 | 3 | 4

export const stepCounter = (step: FlowStep) => `${String(step).padStart(2, '0')}/${String(flowSteps.length).padStart(2, '0')}`
