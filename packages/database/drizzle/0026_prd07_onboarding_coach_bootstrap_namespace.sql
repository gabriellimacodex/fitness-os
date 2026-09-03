ALTER TABLE "onboarding_operation" DROP CONSTRAINT "onboarding_operation_namespace_check";--> statement-breakpoint
ALTER TABLE "onboarding_operation" ADD CONSTRAINT "onboarding_operation_namespace_check" CHECK ("onboarding_operation"."namespace" IN (
        'create_attempt',
        'resume_attempt',
        'abandon_attempt',
        'refresh_policy',
        'claim_attempt',
        'issue_student_invitation',
        'revoke_student_invitation',
        'issue_coach_bootstrap_invitation'
      ));