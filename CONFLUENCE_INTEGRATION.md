# Confluence Integration for BRD Generator

## Overview

The BRD Generator now includes seamless integration with Atlassian Confluence, allowing you to automatically publish generated Business Requirements Documents directly to your Confluence workspace.

## Features

- **Automatic Publishing**: Generate and publish BRDs to Confluence in a single workflow
- **Smart Organization**: Automatic labeling and structured content organization
- **Flexible Configuration**: Toggle integration on/off with secure credential management
- **Rich Content Support**: Technical data tables, diagrams, and structured sections

## Setup Instructions

### 1. Generate Confluence API Token
1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a descriptive name (e.g., "BRD Generator")
4. Copy the generated token

### 2. Configure Environment Variables
Update your `server/.env` file:
```env
CONFLUENCE_BASE_URL=https://your-company.atlassian.net
CONFLUENCE_USERNAME=your.email@company.com
CONFLUENCE_API_TOKEN=your_api_token_here
CONFLUENCE_SPACE_KEY=BRD
```

### 3. Enable Integration in UI
1. Navigate to the "Generate BRD" page
2. Toggle on "Confluence Integration"
3. Fill in your Confluence details
4. Click "Test Connection" to verify setup

## API Endpoints

- `GET /api/confluence/test` - Test connection
- `POST /api/confluence/create` - Create BRD page
- `PUT /api/confluence/update/:pageId` - Update existing page
- `GET /api/confluence/search` - Search BRD pages
- `POST /api/generate-brd-with-confluence` - Generate with publishing

## Generated Page Structure

### Page Title Format
```
BRD - [Client] [Mode] [Direction] Integration - [Date]
```

### Content Sections
1. Header with metadata
2. Business information
3. Form data table
4. Generated content
5. Technical data
6. Summary and next steps

## Security Considerations

- API tokens stored securely in environment variables
- Appropriate Confluence permissions required
- Regular token rotation recommended

## Troubleshooting

### Common Issues
- **Connection Failed**: Verify credentials and URL
- **Permission Denied**: Check Confluence permissions
- **Page Creation Failed**: Verify space key and parent page ID

## Best Practices

- Use consistent space structure
- Implement naming conventions
- Test in development space first
- Monitor API usage and limits 