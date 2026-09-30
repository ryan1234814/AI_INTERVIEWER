from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io
import json
import logging

logger = logging.getLogger(__name__)

def generate_interview_pdf(candidate_name, job_title, evaluation_data, responses,
                           proctor_summary=None):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=letter,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#2563EB'),
        spaceAfter=30
    )
    
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#059669'),
        spaceBefore=20,
        spaceAfter=10
    )

    question_style = ParagraphStyle(
        'QuestionStyle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#1E40AF'),
        spaceAfter=4,
        fontName='Helvetica-Bold'
    )

    response_style = ParagraphStyle(
        'ResponseStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#374151'),
        spaceAfter=4,
        leftIndent=15
    )

    feedback_style = ParagraphStyle(
        'FeedbackStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#6B7280'),
        fontName='Helvetica-Oblique',
        spaceAfter=4,
        leftIndent=15
    )

    score_label_style = ParagraphStyle(
        'ScoreLabelStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#059669'),
        fontName='Helvetica-Bold',
        leftIndent=15,
        spaceAfter=8
    )

    elements = []
    
    # Header
    elements.append(Paragraph("Interview Performance Report", title_style))
    elements.append(Paragraph(f"<b>Candidate:</b> {candidate_name}", styles['Normal']))
    elements.append(Paragraph(f"<b>Role:</b> {job_title}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Scores Table
    elements.append(Paragraph("Overall Evaluation", section_style))

    overall = getattr(evaluation_data, 'overall_score', 0) or 0
    technical = getattr(evaluation_data, 'technical_score', 0) or 0
    communication = getattr(evaluation_data, 'communication_score', 0) or 0
    relevance = getattr(evaluation_data, 'relevance_score', 0) or 0

    score_data = [
        ["Category", "Score / 10"],
        ["Overall Score", f"{overall:.1f}"],
        ["Technical Proficiency", f"{technical:.1f}"],
        ["Communication", f"{communication:.1f}"],
        ["Role Relevance", f"{relevance:.1f}"]
    ]
    
    score_table = Table(score_data, colWidths=[250, 120])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    elements.append(score_table)
    elements.append(Spacer(1, 20))
    
    # Strengths and Weaknesses
    elements.append(Paragraph("Key Insights", section_style))

    strengths = getattr(evaluation_data, 'strengths', []) or []
    weaknesses = getattr(evaluation_data, 'weaknesses', []) or []

    elements.append(Paragraph("<b>Strengths:</b>", styles['Normal']))
    for s in strengths:
        elements.append(Paragraph(f"&bull; {_safe_text(s)}", styles['Normal']))
    
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("<b>Areas for Improvement:</b>", styles['Normal']))
    for w in weaknesses:
        elements.append(Paragraph(f"&bull; {_safe_text(w)}", styles['Normal']))
    
    elements.append(Spacer(1, 20))
    
    # Summary
    elements.append(Paragraph("Executive Summary", section_style))
    summary = getattr(evaluation_data, 'summary', 'Interview completed.') or 'Interview completed.'
    elements.append(Paragraph(_safe_text(summary), styles['Normal']))
    
    elements.append(Spacer(1, 20))

    # Behavioral & Soft-Skill Summary
    beh_summary = getattr(evaluation_data, 'behavioral_summary', None)
    if beh_summary:
        elements.append(Paragraph("Behavioral &amp; Soft-Skill Analysis", section_style))
        # Behavioral scores table
        beh_data = [["Dimension", "Score / 10"]]
        mapping = [
            ("Clarity", beh_summary.get("avg_clarity")),
            ("Confidence", beh_summary.get("avg_confidence")),
            ("STAR Structure", beh_summary.get("avg_star")),
            ("Empathy / Teamwork", beh_summary.get("avg_empathy")),
            ("Sentiment", beh_summary.get("avg_sentiment")),
        ]
        for label, val in mapping:
            beh_data.append([label, f"{val:.1f}" if val is not None else "N/A"])
        # speech metrics row
        if beh_summary.get("avg_filler_rate") is not None:
            beh_data.append(["Filler Rate (%)", f"{beh_summary['avg_filler_rate']:.1f}%"])
        if beh_summary.get("avg_wpm"):
            beh_data.append(["Avg WPM", f"{beh_summary['avg_wpm']:.0f}"])
        beh_table = Table(beh_data, colWidths=[250, 120])
        beh_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C3AED')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F3FF')]),
        ]))
        elements.append(beh_table)
        elements.append(Spacer(1, 10))
        highlights = beh_summary.get("highlights", [])
        if highlights:
            elements.append(Paragraph("<b>Behavioral Highlights:</b>", styles['Normal']))
            for h in highlights[:3]:
                elements.append(Paragraph(f"&bull; {_safe_text(h)}", styles['Normal']))
            elements.append(Spacer(1, 10))
        # interpretation
        ac = beh_summary.get("avg_clarity")
        if ac is not None:
            if ac >= 7:
                interp = "Strong communicator — clear, structured, and confident delivery."
            elif ac >= 5:
                interp = "Adequate communication — generally clear with minor hesitations."
            else:
                interp = "Communication needs improvement — consider STAR structure and reducing filler words."
            elements.append(Paragraph(f"<i>{_safe_text(interp)}</i>", styles['Normal']))
            elements.append(Spacer(1, 10))

    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E5E7EB')))
    elements.append(Spacer(1, 10))

    # ==============================
    # Webcam Proctoring — Focus & Integrity
    # ==============================
    if proctor_summary:
        elements.append(Paragraph("Webcam Proctoring — Focus &amp; Integrity", section_style))
        focus_pct = proctor_summary.get("focus_pct", 0)
        warnings = proctor_summary.get("warnings", 0)
        devices = proctor_summary.get("device_detections", 0)
        integrity = str(proctor_summary.get("integrity", "n/a")).replace("_", " ").title()
        proc_data = [
            ["Metric", "Value"],
            ["Focus %", f"{focus_pct:.1f}%"],
            ["Integrity", integrity],
            ["Warnings", str(warnings)],
            ["Device Detections (phone/laptop)", str(devices)],
        ]
        avg_focus = proctor_summary.get("avg_focus")
        if avg_focus is not None:
            proc_data.append(["Avg Reported Focus", f"{avg_focus:.1f}%"])
        proc_table = Table(proc_data, colWidths=[250, 120])
        proc_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0E7490')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ECFEFF')]),
        ]))
        elements.append(proc_table)
        elements.append(Spacer(1, 8))
        counts = proctor_summary.get("counts", {})
        if counts:
            breakdown = " | ".join(f"{k}: {v}" for k, v in sorted(counts.items()))
            elements.append(Paragraph(f"<b>Event breakdown:</b> {_safe_text(breakdown)}", styles['Normal']))
            elements.append(Spacer(1, 8))
        if warnings > 0:
            elements.append(Paragraph(
                f"<i>Candidate triggered {warnings} proctoring warning(s) during the session. "
                "Please review the session recording/events before making a final decision.</i>",
                styles['Normal']))
            elements.append(Spacer(1, 10))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E5E7EB')))
        elements.append(Spacer(1, 10))

    # ==============================
    # Q&A History — Detailed per-question breakdown
    # ==============================
    elements.append(Paragraph("Interview Q&amp;A Details", section_style))
    elements.append(Spacer(1, 5))
    
    # Filter out empty placeholder responses
    valid_responses = [r for r in responses if r.candidate_response and r.candidate_response.strip()]
    
    if not valid_responses:
        elements.append(Paragraph("<i>No candidate responses recorded for this interview.</i>", styles['Normal']))
    else:
        for i, resp in enumerate(valid_responses):
            # Question number + text
            q_text = _safe_text(resp.question_text or f"Question {i+1}")
            elements.append(Paragraph(f"Q{i+1}: {q_text}", question_style))
            
            # Candidate response
            r_text = _safe_text(resp.candidate_response or "(No response)")
            elements.append(Paragraph(f"<b>Answer:</b> {r_text}", response_style))
            
            # Parse evaluation data from feedback field
            score, feedback_text = _parse_feedback(resp.feedback, getattr(resp, 'evaluation_score', None))
            
            # Score badge
            if score is not None and score > 0:
                score_color = _score_color(score)
                elements.append(Paragraph(
                    f"Score: {score}/10",
                    score_label_style
                ))
            
            # AI Feedback
            if feedback_text:
                elements.append(Paragraph(
                    f"<b>AI Feedback:</b> {_safe_text(feedback_text)}",
                    feedback_style
                ))

            # Behavioral per-question breakdown
            ba = getattr(resp, 'behavioral_analysis', None)
            if isinstance(ba, str):
                try:
                    import json as _json
                    ba = _json.loads(ba)
                except:
                    ba = None
            if isinstance(ba, dict):
                sm = ba.get("speech_metrics", {})
                beh_lines = []
                if ba.get("clarity") is not None:
                    beh_lines.append(f"Clarity {ba['clarity']}/10")
                if ba.get("confidence") is not None:
                    beh_lines.append(f"Confidence {ba['confidence']}/10")
                if ba.get("star_structure") is not None:
                    beh_lines.append(f"STAR {ba['star_structure']}/10")
                if sm.get("filler_rate") is not None:
                    beh_lines.append(f"Fillers {sm['filler_rate']}% ({sm.get('filler_count',0)})")
                if ba.get("sentiment_heuristic", {}).get("label"):
                    beh_lines.append(f"Sentiment {ba['sentiment_heuristic']['label']}")
                if beh_lines:
                    elements.append(Paragraph(
                        f"<b>Behavioral:</b> {_safe_text(' | '.join(beh_lines))}",
                        ParagraphStyle('BehStyle', parent=feedback_style, textColor=colors.HexColor('#7C3AED'))
                    ))
                if ba.get("summary"):
                    elements.append(Paragraph(
                        f"<i>{_safe_text(ba['summary'])}</i>",
                        ParagraphStyle('BehSummary', parent=feedback_style, fontSize=8, textColor=colors.HexColor('#6D28D9'))
                    ))
            
            # Separator between questions
            elements.append(Spacer(1, 5))
            elements.append(HRFlowable(width="90%", thickness=0.5, color=colors.HexColor('#E5E7EB')))
            elements.append(Spacer(1, 8))

    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(
        f"<i>Report generated for {_safe_text(candidate_name)} — AI Interviewer Platform</i>",
        ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#9CA3AF'), alignment=1)
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def _parse_feedback(feedback_raw, evaluation_score):
    """Parse the feedback field which may be a JSON string, a dict, or a plain string."""
    score = evaluation_score
    feedback_text = ""
    
    if not feedback_raw:
        return score, feedback_text
    
    # Try to parse as JSON
    try:
        if isinstance(feedback_raw, str):
            data = json.loads(feedback_raw)
        elif isinstance(feedback_raw, dict):
            data = feedback_raw
        else:
            return score, str(feedback_raw)
        
        # Extract score from various possible keys
        if 'technical_accuracy' in data:
            score = data['technical_accuracy']
        elif 'score' in data:
            score = data['score']
        
        # Extract feedback text from various possible keys
        if 'feedback' in data:
            feedback_text = data['feedback']
        elif 'evaluation' in data:
            feedback_text = data['evaluation']
        elif 'summary' in data:
            feedback_text = data['summary']
        else:
            # Use all non-score fields as feedback
            parts = []
            for k, v in data.items():
                if k not in ('technical_accuracy', 'score') and isinstance(v, str):
                    parts.append(f"{k}: {v}")
            feedback_text = "; ".join(parts) if parts else str(data)
            
    except (json.JSONDecodeError, TypeError, ValueError):
        # Not JSON — use as plain text
        feedback_text = str(feedback_raw)
    
    return score, feedback_text


def _score_color(score):
    """Return a color based on score value."""
    if score >= 8:
        return colors.HexColor('#059669')  # Green
    elif score >= 6:
        return colors.HexColor('#D97706')  # Amber
    elif score >= 4:
        return colors.HexColor('#EA580C')  # Orange
    else:
        return colors.HexColor('#DC2626')  # Red


def _safe_text(text):
    """Escape XML-unsafe characters for ReportLab Paragraph."""
    if not text:
        return ""
    text = str(text)
    # Replace XML-unsafe characters
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    # But preserve our own HTML tags
    text = text.replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
    text = text.replace('&lt;i&gt;', '<i>').replace('&lt;/i&gt;', '</i>')
    return text
