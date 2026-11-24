import { Button } from "@/components/ui";
import type { KycStepName, KycView } from "@/lib/api/identity-types";
import { BankStep } from "./BankStep";
import { DigiLockerStep } from "./DigiLockerStep";
import { PanStep } from "./PanStep";
import { closeVerifyId } from "./routes";
import { StepFrame, StepIntro, type FrameProps } from "./StepFrame";
import { ALL_TODO, currentStep } from "./steps-model";

/**
 * kyc-checks (plan 07): Verify your ID in the "steps" flow. PAN, then Aadhaar through DigiLocker,
 * then a bank account by reverse penny drop, one screen at a time under a 3-step progress header.
 * The step to show is the first one not finished; a step that didn't pass is shown again to retry.
 * Once all three are finished the server decides (verified, or a person checks), and Verify your ID
 * shows that instead (VerifyIdScreen).
 */
export function StepsFlow({
  view,
  restart,
  practice,
  back,
  onView,
  onPracticePhoto,
  onRefresh,
}: {
  view: KycView;
  /** Practice "Practice the check again": every step to do, until the PAN's answer comes back. */
  restart: boolean;
  practice: boolean;
  back?: () => void;
  onView: (view: KycView, step: KycStepName) => void;
  onPracticePhoto: () => void;
  onRefresh: () => void;
}) {
  const steps = restart ? ALL_TODO : (view.steps ?? ALL_TODO);
  const current = currentStep(steps);
  const frame: FrameProps = { steps, current, back, onPracticePhoto: practice ? onPracticePhoto : undefined, practiceRestart: practice && restart };
  const shared = { frame, reasons: restart ? [] : view.reasons, practice, onView, onStale: onRefresh };
  switch (current) {
    case "pan":
      return <PanStep key="pan" {...shared} step={steps.pan} />;
    case "aadhaar":
      return <DigiLockerStep key="aadhaar" {...shared} step={steps.aadhaar} />;
    case "bank":
      return <BankStep key="bank" {...shared} step={steps.bank} />;
    default:
      // All three finished but no decision yet: only for a moment, while the server concludes.
      return (
        <StepFrame
          frame={frame}
          busy={false}
          footer={
            <>
              <Button label="Check again" variant="tonal" onPress={onRefresh} />
              <Button label="Done" onPress={closeVerifyId} armOnMount />
            </>
          }
        >
          <StepIntro title="All three steps are done" body="We're finishing your check. It takes a moment." />
        </StepFrame>
      );
  }
}
