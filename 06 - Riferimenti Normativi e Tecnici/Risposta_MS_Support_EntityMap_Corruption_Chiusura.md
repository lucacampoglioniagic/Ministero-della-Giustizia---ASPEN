Subject: RE: [Case] agc_canestro / agc_fascicolo filtered view corruption — issue resolved, closing case

Hello Iwayemi,

Apologies for the delayed response, and thank you for your patience and for the diagnostic support
provided earlier.

I wanted to let you know that we no longer need to pursue this issue: given project time
constraints, we decided to rebuild the application from scratch in a new environment rather than
continue troubleshooting the orphaned `EntityRelationshipRole` / metadata corruption on
`agc_canestro` / `agc_fascicolo`. The new build does not carry over the affected tables or the
corrupted references, so the symptom no longer applies to us.

Thank you again for the detailed root-cause analysis — it was very helpful in confirming the
corruption and its likely source, even though we ultimately worked around it by rebuilding rather
than waiting for a backend fix. Please feel free to close this case on your end.

Best regards,
Luca Campoglioni
