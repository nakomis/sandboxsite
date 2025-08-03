# ATTRIBUTIONS

This file lists all third-party dependencies used in the BootBoots Web Application (sandbox-app).

## Web Application Dependencies

### React
- **Package**: react, react-dom
- **Version**: 19.1.0
- **License**: MIT
- **Source**: https://github.com/facebook/react
- **Description**: JavaScript library for building user interfaces

### AWS SDK for JavaScript
- **Packages**:
  - @aws-sdk/client-cognito-identity (3.848.0)
  - @aws-sdk/client-s3 (3.859.0)
  - @aws-sdk/credential-provider-cognito-identity (3.859.0)
  - @aws-sdk/s3-request-presigner (3.859.0)
- **License**: Apache-2.0
- **Source**: https://github.com/aws/aws-sdk-js-v3
- **Description**: AWS SDK for JavaScript, used for S3 and Cognito integration

### Material-UI
- **Packages**:
  - @mui/material (7.2.0)
  - @emotion/react (11.14.0)
  - @emotion/styled (11.14.0)
- **License**: MIT
- **Source**: https://github.com/mui/material-ui
- **Description**: React UI framework implementing Material Design

### React OIDC Context
- **Package**: react-oidc-context
- **Version**: 3.3.0
- **License**: MIT
- **Source**: https://github.com/authts/react-oidc-context
- **Description**: OpenID Connect authentication for React applications

### React Router
- **Package**: react-router
- **Version**: 7.7.0
- **License**: MIT
- **Source**: https://github.com/remix-run/react-router
- **Description**: Declarative routing for React applications

### Bootstrap
- **Package**: bootstrap
- **Version**: 5.3.7
- **License**: MIT
- **Source**: https://github.com/twbs/bootstrap
- **Description**: CSS framework for responsive web design

### TypeScript
- **Package**: typescript
- **Version**: 4.9.5
- **License**: Apache-2.0
- **Source**: https://github.com/microsoft/TypeScript
- **Description**: Typed superset of JavaScript that compiles to plain JavaScript

### Testing Libraries
- **Packages**:
  - @testing-library/dom (10.4.0)
  - @testing-library/jest-dom (6.6.3)
  - @testing-library/react (16.3.0)
  - @testing-library/user-event (13.5.0)
- **License**: MIT
- **Source**: https://github.com/testing-library
- **Description**: Simple and complete testing utilities for React

### Web Bluetooth API
- **Package**: @types/web-bluetooth
- **Version**: 0.0.21
- **License**: MIT
- **Source**: https://github.com/DefinitelyTyped/DefinitelyTyped
- **Description**: TypeScript definitions for Web Bluetooth API

### React Scripts
- **Package**: react-scripts
- **Version**: 5.0.1
- **License**: MIT
- **Source**: https://github.com/facebook/create-react-app
- **Description**: Scripts and configuration used by Create React App

### Web Vitals
- **Package**: web-vitals
- **Version**: 2.1.4
- **License**: Apache-2.0
- **Source**: https://github.com/GoogleChrome/web-vitals
- **Description**: Library for measuring web vitals metrics

## FirmwareManager Component

The FirmwareManager component in this application provides OTA (Over-The-Air) firmware update functionality for BootBoots ESP32-CAM devices. It uses:

- **Web Bluetooth API** for device communication
- **AWS S3** for firmware storage and retrieval
- **AWS Cognito** for authentication and secure access to firmware files
- **React Hooks** for state management
- **Material-UI** for UI components

## Note on License Compliance

This file is provided for informational purposes to acknowledge the third-party dependencies used in the BootBoots Web Application. Each dependency is subject to its own license terms. Users and contributors should review the license terms of each dependency before use or modification.

For full license texts, please refer to the respective project repositories or websites linked above.

Last Updated: August 3, 2025
