import nodemailer from "nodemailer";

const sendEmail = async (email, subject, message) => {
    try {
        // console.log("SMTP_HOST:", process.env.SMTP_HOST);
        // console.log("SMTP_PORT:", process.env.SMTP_PORT);
        // console.log("SMTP_USERNAME:", process.env.SMTP_USERNAME);

        let transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT == 465,
            auth: {
                user: process.env.SMTP_USERNAME,
                pass: process.env.SMTP_PASSWORD,
            },
            debug: true,
        });

        // console.log("Sending email to:", email);
        // console.log("Subject:", subject);
        // console.log("Message:", message);

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM_EMAIL,
            to: email,
            subject: subject,
            html: message,
        });

        console.log("Message sent: %s", info.messageId);

    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error(`Failed to send email: ${error.message}`);
    }
}

export default sendEmail;
