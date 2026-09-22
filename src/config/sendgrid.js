import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const sendOTPEmail = async (email, otp) => {
  const msg = {
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: "Checkmate — Your Login OTP",
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Checkmate</h2>
        <p>Your one-time password is:</p>
        <h1 style="letter-spacing: 8px; font-size: 36px;">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
      </div>
    `,
  };

  await sgMail.send(msg);
};
