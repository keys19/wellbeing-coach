// import sgMail from '@sendgrid/mail';

// // Email frequency types for type safety
// export type EmailFrequency = 'daily' | 'biweekly' | 'weekly' | 'monthly';

// // Initialize SendGrid with API key
// if (process.env.SENDGRID_API_KEY) {
//   sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// }

// /**
//  * Send an email using SendGrid
//  */
// export const sendEmail = async (
//   to: string,
//   subject: string,
//   text: string,
//   html?: string
// ): Promise<boolean> => {
//   try {
//     // Basic validation
//     if (!to || !subject || !text) {
//       console.error('Missing required email fields');
//       return false;
//     }

//     const msg = {
//       to,
//       from: process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
//       subject,
//       text,
//       html: html || text,
//     };

//     await sgMail.send(msg);
//     console.log('Email sent successfully');
//     return true;
//   } catch (error) {
//     console.error('Error sending email:', error);
//     return false;
//   }
// };

// /**
//  * Send a check-up reminder email
//  */
// export const sendCheckUpReminder = async (
//   to: string,
//   userName: string,
//   botName: string
// ): Promise<boolean> => {
//   const subject = `${botName} Reminder: Your Mental Health Check-up`;

//   const text = `
// Hello ${userName},

// This is a friendly reminder for your scheduled mental health check-up with ${botName}.

// Taking a few minutes to check in with yourself can make a big difference in your overall well-being.
// Simply log in to continue your conversation and track your progress.

// Best regards,
// Your Mental Health Coach Team
//   `;

//   const html = `
// <!DOCTYPE html>
// <html>
// <head>
//   <style>
//     body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
//     .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//     .header { background-color: #4F46E5; color: white; padding: 10px 20px; border-radius: 5px 5px 0 0; }
//     .content { padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
//     .button { display: inline-block; background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
//     .footer { margin-top: 20px; font-size: 12px; color: #666; }
//   </style>
// </head>
// <body>
//   <div class="container">
//     <div class="header">
//       <h2>Mental Health Check-up Reminder</h2>
//     </div>
//     <div class="content">
//       <p>Hello ${userName},</p>
//       <p>This is a friendly reminder for your scheduled mental health check-up with ${botName}.</p>
//       <p>Taking a few minutes to check in with yourself can make a big difference in your overall well-being.</p>
//       <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/app/chat" class="button">Continue Your Conversation</a></p>
//     </div>
//     <div class="footer">
//       <p>If you no longer wish to receive these reminders, you can update your preferences in your account settings.</p>
//     </div>
//   </div>
// </body>
// </html>
//   `;

//   return sendEmail(to, subject, text, html);
// };

// /**
//  * Verify email configuration by checking SendGrid API key
//  */
// export const verifyEmailConfiguration = async (): Promise<boolean> => {
//   try {
//     // Check if SendGrid API key is set
//     if (!process.env.SENDGRID_API_KEY) {
//       console.warn('SendGrid API key not set');
//       return false;
//     }

//     // Try to send a test email to verify the configuration
//     const testMsg = {
//       to: 'test@example.com',
//       from: process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
//       subject: 'Test Email',
//       text: 'This is a test email to verify SendGrid configuration.',
//     };

//     await sgMail.send(testMsg);
//     console.log('SendGrid configuration verified');
//     return true;
//   } catch (error) {
//     console.error('SendGrid verification failed:', error);
//     return false;
//   }
// };

// export default {
//   sendEmail,
//   sendCheckUpReminder,
//   verifyEmailConfiguration,
// }; 


// import axios from 'axios';

// export const sendEmail = async (
//   to: string,
//   subject: string,
//   text: string,
//   html?: string
// ): Promise<boolean> => {
//   try {
//     const response = await axios.post(
//       'https://api.brevo.com/v3/smtp/email',
//       {
//         sender: { email: process.env.BREVO_FROM_EMAIL },
//         to: [{ email: to }],
//         subject,
//         textContent: text,
//         htmlContent: html || text,
//       },
//       {
//         headers: {
//           'api-key': process.env.BREVO_API_KEY || '',
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     console.log('Email sent with Brevo REST API:', response.data);
//     return true;
//   } catch (error) {
//     console.error('Error sending email with Brevo REST API:', error);
//     return false;
//   }
// };

// export const verifyEmailConfiguration = async (): Promise<boolean> => {
//   try {
//     await sendEmail(
//       'krankeyshah@gmail.com', // your test email
//       'Brevo Test Email',
//       'This is a test email sent via the Brevo REST API.'
//     );
//     console.log('Brevo REST API configuration verified');
//     return true;
//   } catch (error) {
//     console.error('Brevo REST API verification failed:', error);
//     return false;
//   }
// };

import axios from 'axios';


export type EmailFrequency = 'daily' | 'biweekly' | 'weekly' | 'monthly';

/**
 * Send an email using Brevo REST API 
 */
export const sendEmail = async (
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> => {
  try {
    if (!to || !subject || !text) {
      console.error('Missing required email fields');
      return false;
    }

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { email: process.env.BREVO_FROM_EMAIL || 'kts5726@nyu.edu' },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html || text,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY || '',
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Email sent with Brevo REST API:', response.data);
    return true;
  } catch (error) {
    console.error('Error sending email with Brevo REST API:', error);
    return false;
  }
};

/**
 * Send a check-up reminder email
 */
export const sendCheckUpReminder = async (
  to: string,
  userName: string,
  botName: string
): Promise<boolean> => {
  const subject = `${botName} Reminder: Your Mental Health Check-up`;

  const text = `
Hello ${userName},

This is a friendly reminder for your scheduled mental health check-up with ${botName}.

Taking a few minutes to check in with yourself can make a big difference in your overall well-being.
Simply log in to continue your conversation and track your progress.

Best regards,
Your Mental Health Coach Team
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4F46E5; color: white; padding: 10px 20px; border-radius: 5px 5px 0 0; }
    .content { padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .button { display: inline-block; background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Mental Health Check-up Reminder</h2>
    </div>
    <div class="content">
      <p>Hello ${userName},</p>
      <p>This is a friendly reminder for your scheduled mental health check-up with ${botName}.</p>
      <p>Taking a few minutes to check in with yourself can make a big difference in your overall well-being.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/app/chat" class="button">Continue Your Conversation</a></p>
    </div>
    <div class="footer">
      <p>If you no longer wish to receive these reminders, you can update your preferences in your account settings.</p>
    </div>
  </div>
</body>
</html>
  `;

  return sendEmail(to, subject, text, html);
};

/**
 * Verify Brevo configuration by sending a test email
 */
export const verifyEmailConfiguration = async (): Promise<boolean> => {
  try {
    
    const success = await sendEmail(
      'test@example.com',
      'Brevo Test Email',
      'This is a test email to verify Brevo REST API configuration.'
    );

    if (success) {
      console.log('Brevo REST API configuration verified');
      return true;
    } else {
      console.warn('Brevo REST API test email failed');
      return false;
    }
  } catch (error) {
    console.error('Brevo REST API verification failed:', error);
    return false;
  }
};


export default {
  sendEmail,
  sendCheckUpReminder,
  verifyEmailConfiguration,
};
