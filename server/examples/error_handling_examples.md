#1
Error Handling
This API accepts raw punches. The processing will be done after the punches are received by Darwinbox.
The biometric vendor/client is required to store the reference ID (ref_id) along with the corresponding payload in logs. In
case of an issue, this ref_id and payload is to be provided to the Darwinbox account management team for validation.
The retry mechanism in case of error should be limited to 2 re-tries only.
If a certain API call gets failed (not getting 200 OK HTTPS response), then maximum 2 retries can be attempted for a given
attendance punch. If still in retry attempts the API call gets failed, then the same should be logged and an issue needs to be
raised to the Darwinbox Team.
Note -
Only relevant punches (for employees who’re active in the Darwinbox instance) should be sent to the API.
No duplicate punches should be sent.
Any Garbage data (which is not related to the API Request Payload mentioned above) should not be sent in the API.
The scope of this integration is limited to the employee strength of 10,000 and a maximum of 1500 API calls can be done in
a day. If in the future, this strength or punch count increases then the same needs to be informed to Darwinbox in advance
before pushing the additional punches.
A throttle limit of 1500 API calls in a day would be present. If in the future, the number of calls increases then the same
needs to be informed to Darwinbox in advance before pushing the additional punches.

#2
Assumptions and Error Handling
Even if there are additional fields that are mandatory in the Darwinbox job application form (and these fields are not
available/captured at Naukri’s end), we will still allow the creation of the candidate profile. However, these fields will remain
blank/unfilled. Either the HR/recruiter will have to manually fill up these attributes or at the time of pre-offer, Darwinbox will
trigger an email to the candidate for signing up and for filling the missing attributes.
Any duplicate candidate profile will not get created if duplicity settings are enabled in Darwinbox. (For example, in Darwinbox,
if the same candidate/email ID is not allowed to apply to multiple jobs at the same time and if some candidate applies to 2
different jobs posted from Darwinbox to Naukri, a duplicate candidate profile will not get created for the second job)
We have built the inbound integration in such a way that the candidate profile gets created even if there are fields tagged to
the job application for which data is not available in the Naurki API response.
An email notification containing success and error logs can be triggered to the required client stakeholders every day after the
CRON/script gets executed.

#3
Error Handling Logic
Any errors encountered during the integration will be reported via automated email notifications to the distribution list provided
by the Visteon team.
A try-catch system and retry mechanism will be implemented for all Darwinbox API calls and SFTP file transfers.
In case the file is generated but fails to transfer via SFTP: The Visteon team can download the output file from the Darwinbox
Studio module and manually upload it to the destination SFTP folder.
In case the file is not generated: The Visteon team can re-trigger the integration script from the Darwinbox Studio module. If
the issue persists, a ticket must be raised through the Darwinbox AD Portal.

#4
Error Handling Logic
Piramal tech team is required to store the endpoint status code, response and payload received from Darwinbox in logs (i.e., the API consumption logs of the api endpoint shared by
Piramal tech team). In case of an issue, the API consumption logs is to be provided to the Darwinbox account management team for validation.
In case of any issue once the integration is live, kindly create an AD ticket and raise it to AD team. AD team will evaluate it, do the first level of validation and then assign the ticket to the
relevant lead/ integration SPOC for issue resolution.

#5
An email will be sent to the concerned client SPOCs with success and error logs thrice a day. Please note that the Integrations team will ensure that client and Account Management
Emails are added to all notification alerts. In case of any error (possible errors defined below), client/ AM need to create a AD ticket and raise it to AD team. AD team will evaluate it, do
the first level of validation and then AM team need to assign the ticket to the relevant lead/ integration SPOC for issue resolution.

#6
Error or Success Notifications will be triggered on the Email recipients mentioned in the initial table.

#7
Error or Success Notifications will be triggered on the Email recipients mentioned in the initial table.
