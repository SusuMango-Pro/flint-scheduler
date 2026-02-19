const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

// Set your SendGrid API key via:
//   firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
//   firebase functions:config:set email.from="noreply@yourdomain.com"
sgMail.setApiKey(functions.config().sendgrid.key);
const FROM_EMAIL = functions.config().email.from;

/**
 * Fires whenever a mix document is updated in Firestore.
 * Sends an email to the mix creator when ALL stages are complete
 * (i.e. the last stage was just started — meaning the user clicked
 * "Next Stage" to reach the final stage).
 */
exports.notifyMixComplete = functions.firestore
    .document("mixes/{mixId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        if (!after || after.isDeleted) return null;

        const totalStages = after.powders?.length ?? 0;
        if (totalStages === 0) return null;

        const lastStageIndex = totalStages - 1;

        // Only trigger when the user just advanced to the LAST stage
        const justReachedLastStage =
            after.currentStageIndex === lastStageIndex &&
            before.currentStageIndex !== lastStageIndex;

        if (!justReachedLastStage) return null;

        const toEmail = after.createdByEmail;
        const toName = after.createdByName || toEmail;
        const mixName = after.mixName || "Your mix";
        const lastStage = after.powders[lastStageIndex];
        const durationMin = Math.round((lastStage?.durationMs || 0) / 60000);

        const msg = {
            to: toEmail,
            from: FROM_EMAIL,
            subject: `⏱ Final stage started: ${mixName}`,
            text: `Hi ${toName},\n\nThe final stage of "${mixName}" has just started (${lastStage?.stageName}, ${durationMin} min).\n\nOnce this stage is complete, your mix will be done!\n\n— Mix Scheduler`,
            html: `
        <p>Hi <strong>${toName}</strong>,</p>
        <p>The <strong>final stage</strong> of <em>${mixName}</em> has just started:</p>
        <ul>
          <li><strong>Stage:</strong> ${lastStage?.stageName}</li>
          <li><strong>Duration:</strong> ${durationMin} minutes</li>
        </ul>
        <p>Once this stage is complete, your mix will be done! 🎉</p>
        <p style="color:#999;font-size:12px;">— Mix Scheduler</p>
      `,
        };

        try {
            await sgMail.send(msg);
            console.log(`Email sent to ${toEmail} for mix "${mixName}"`);
        } catch (err) {
            console.error("SendGrid error:", err?.response?.body || err.message);
        }

        return null;
    });
