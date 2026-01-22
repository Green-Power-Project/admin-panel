declare module 'nodemailer' {
  export interface TransportOptions {
    service?: string;
    auth?: {
      user: string;
      pass: string;
    };
  }

  export interface MailOptions {
    from?: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }

  export interface Transporter {
    sendMail(mailOptions: MailOptions): Promise<any>;
  }

  export function createTransport(options: TransportOptions): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
