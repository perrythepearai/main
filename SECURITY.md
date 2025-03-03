# Security Policy

## Supported Versions

Currently, the Perry AI Quest project is in Alpha phase. Security updates and support are available for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Alpha   | :white_check_mark: |
| Pre-Alpha | :x:              |

## Security Features

The Perry AI Quest application implements several security measures:

### Wallet Authentication
- Secure wallet connection via MetaMask and Reown AppKit
- Auth token generation for authenticated sessions
- Automatic session termination on wallet disconnection or account switching

### API Security
- Rate limiting on all API endpoints
- JWT authentication for protected API routes
- Input validation and sanitization for all user inputs
- Environment variable protection for OpenAI API keys

### Data Security
- PostgreSQL database with SSL encryption
- Hashed authentication tokens
- No storage of private keys or seed phrases
- Minimal permission design pattern

## Reporting a Vulnerability

We take the security of the Perry AI Quest seriously. If you believe you've found a security vulnerability, please follow these steps:

1. **Do not disclose the vulnerability publicly** until we've had a chance to address it.
2. Email the details to [security@perrythepear.com](mailto:dev@perrythepear.com) with the subject line "Perry Security Vulnerability".
3. Include as much information as possible, including:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Any suggestions for mitigation

### Response Timeline
- **Acknowledgment**: We aim to acknowledge receipt of your report within 48 hours.
- **Verification**: We will verify the vulnerability and determine its impact within 5 business days.
- **Updates**: We will provide updates on the progress of addressing the vulnerability at least once a week.
- **Resolution**: Once resolved, we will notify you and provide details of the fix.

### Responsible Disclosure
When we've patched the vulnerability, we encourage responsible disclosure. We'd be happy to acknowledge your contribution if you wish.

## Security Best Practices for Users

### Wallet Security
- Never share your private keys or seed phrases with anyone, including Perry AI
- Always verify you're on the correct site (https://hi.perrythepear.com) before connecting your wallet
- Disconnect your wallet when not actively using the application

### Account Security
- Use a secure, modern browser updated to the latest version
- Consider using a dedicated browser or profile for blockchain applications
- Be vigilant about phishing attempts impersonating Perry AI

## Known Issues

- The application is currently in Alpha stage, and while we take security seriously, not all security features may be fully implemented
- Smart contract integrations are still under development and audit

## Changes to This Policy

This Security Policy may be updated from time to time. We will notify users of any significant changes through the application or via email if applicable.

Last updated: March 3, 2025
